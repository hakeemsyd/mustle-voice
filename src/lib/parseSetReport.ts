import { normalizeSpokenNumbers } from '../onboarding/normalizeSpokenNumbers';
import { kgToDisplayWeight, type Units } from './units';

export interface ParsedSet {
  weight: number | null;
  reps: number;
  /** "seconds" for a timed/isometric hold (Plank, etc.) — changes how describeParsedSet phrases
   *  it. Omitted (rep-count) is the default for every other exercise. */
  unit?: 'seconds';
}

// Keyword-anchored first, position second. A number followed by kg/lb is the weight and
// one followed by reps/rep/x is the reps, whichever order they're said in — so "8 reps at
// 60kg" parses the same as "60kg for 8". Only when neither keyword appears do we fall back
// to positional (first = weight, second = reps), the common "60 8" shorthand.
//
// A lone bare number is ambiguous — "60" could be a weight or 60 reps — so it's rejected
// rather than guessed. Guessing it as reps is what silently logged "60 reps, bodyweight"
// three times against a real session instead of "60kg".
// The ordinal only, never "3 sets of 10" or "a set of 8", which carry real counts.
const SET_ORDINAL_PATTERN = /\b(?:sets?\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s+set)\b/gi;

const POUND_UNIT = /pound|lb/i;

const toKg = (value: number, statedUnit: string | null, units: Units): number => {
  const isPounds = statedUnit ? POUND_UNIT.test(statedUnit) : units === 'imperial';
  return isPounds ? Math.round(value * 0.453592 * 10) / 10 : value;
};

export interface ParseSetOptions {
  allowPositional?: boolean;
  timedExercise?: boolean;
}

export function parseSetReport(
  raw: string,
  units: Units = 'metric',
  options: ParseSetOptions = {},
): ParsedSet | null {
  const normalized = normalizeSpokenNumbers(raw);

  if (options.timedExercise) {
    const durationMatch = normalized.match(
      /(\d+(?:\.\d+)?)\s*(?:sec|secs|second|seconds|min|mins|minute|minutes)\b/i,
    );
    if (durationMatch) {
      const isMinutes = /min/i.test(durationMatch[0]);
      const reps = Math.round(Number(durationMatch[1]) * (isMinutes ? 60 : 1));
      return reps > 0 ? { weight: null, reps, unit: 'seconds' } : null;
    }
  }

  const weightMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)\b/i);
  const repsMatch = normalized.match(/(\d+)\s*(?:reps?|x)\b/i);

  if (weightMatch || repsMatch) {
    const weight = weightMatch ? toKg(Number(weightMatch[1]), weightMatch[2], units) : null;
    let reps = repsMatch ? Math.round(Number(repsMatch[1])) : null;

    // "60kg 8" — weight was pinned by its unit, so the remaining loose number is the reps. The
    // set's own ordinal is stripped first: "Set two done, 80 kilograms" normalizes to "Set 2
    // done, 80 kilograms", and that 2 was read as the rep count, logging an 80kg set as 2 reps.
    if (reps === null && weightMatch) {
      const leftover = normalized
        .replace(weightMatch[0], ' ')
        .replace(SET_ORDINAL_PATTERN, ' ')
        .match(/\d+/);
      if (leftover) reps = Math.round(Number(leftover[0]));
    }
    // "8 reps" alone is a valid bodyweight set; a weight with no reps at all is not.
    if (reps === null || reps <= 0) return null;
    return { weight, reps };
  }

  // Positional fallback only fires when the ENTIRE utterance is just two bare numbers with
  // nothing else meaningful around them ("60 8", "60, 8", "60 for 8") — not merely "contains two
  // numbers somewhere," which is what let ordinary conversation ("I've got about 1 more set,
  // give me 2 minutes") get misread as a phantom set. Anchoring the whole trimmed string means
  // any other words fail this fallback and go to the coach instead — the false-negative cost (a
  // wordier terse report going to chat) is far cheaper than a fabricated set.
  if (options.allowPositional === false) return null;

  const positional = normalized.trim().match(
    /^(\d+(?:\.\d+)?)\s*(?:,|for|x|by)?\s*(\d+)\s*(?:reps?|times|each)?\.?$/i,
  );
  if (!positional) return null;

  const weight = toKg(Number(positional[1]), null, units);
  const reps = Math.round(Number(positional[2]));
  return reps > 0 ? { weight, reps } : null;
}

const STATED_WEIGHT_PATTERN =
  /^(?:(?:it'?s|its|i'?m\s+using|im\s+using|using|with|at|about|around|roughly|maybe|let'?s\s+do|lets\s+do|do|go\s+with|going\s+with|make\s+it|put\s+on)\s+)?(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)\s*\.?$/i;

export function parseStatedWeight(raw: string, units: Units = 'metric'): number | null {
  if (parseSetReport(raw, units) !== null) return null;
  const match = normalizeSpokenNumbers(raw).trim().match(STATED_WEIGHT_PATTERN);
  if (!match) return null;
  const weight = toKg(Number(match[1]), match[2] ?? null, units);
  return weight > 0 ? weight : null;
}

export function describeParsedSet(parsed: ParsedSet, units: Units = 'metric'): string {
  if (parsed.unit === 'seconds') {
    return parsed.reps >= 60 && parsed.reps % 60 === 0
      ? `${parsed.reps / 60} min`
      : `${parsed.reps}s held`;
  }
  return parsed.weight === null
    ? `${parsed.reps} reps · bodyweight`
    : `${kgToDisplayWeight(parsed.weight, units)} × ${parsed.reps} reps`;
}

// Distinguishes "I did a set" from "hey coach, question" — the same split the design
// makes, so one field serves both without a mode toggle. Anything with a unit/rep
// keyword or a completion word is a report; everything else goes to the coach.
export function looksLikeSetReport(
  raw: string,
  units: Units = 'metric',
  options: ParseSetOptions = {},
): boolean {
  if (parseSetReport(raw, units, options) !== null) return true;
  return /\b(done|complete|completed|finished)\b/i.test(raw);
}

// Spoken intent to end rest and begin the next set. Matched locally rather than left to the
// agent's `adjust_rest_timer` tool call: that round-trip depends on the model recognising the
// intent AND on it being able to see that a rest period is live, and when either misses, the
// timer just sits there with no way to move it on. This makes the common phrasings work
// directly. Deliberately narrow — an anchored whole-utterance match, so "I'll start set three
// in a minute" or a passing mention mid-sentence doesn't skip the user's rest.
const START_SET_PATTERNS = [
  // Confirmed live: "Let's move to Set two" never matched — "move" wasn't one of the recognized
  // verbs, unlike "Let's start set two". Added it, plus an optional "on"/"to" filler since "move"
  // naturally pairs with one ("move on to the next set", "move to set two") where the other verbs
  // don't need it.
  /^(?:ok(?:ay)?|alright|right|yeah|yep)?\s*,?\s*(?:let'?s\s+)?(?:go|start|begin|do|move)(?:ing)?\s*(?:on\s+)?(?:to\s+)?(?:the\s+)?(?:next\s+)?(?:set)?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*$/,
  /^(?:i'?m\s+)?(?:ready|done)(?:\s+(?:for|with)\s+(?:the\s+)?(?:next\s+)?(?:set|rest)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?)?\s*$/,
  /^(?:next\s+set|set\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))\s*$/,
  /^(?:skip|end|stop)\s+(?:the\s+)?rest\s*$/,
  /^rest\s+(?:is\s+)?(?:done|over|finished)\s*$/,
];

export function looksLikeStartSetCommand(raw: string): boolean {
  const normalized = raw.trim().toLowerCase().replace(/[.!?,]+$/g, '');
  if (!normalized) return false;
  return START_SET_PATTERNS.some((pattern) => pattern.test(normalized));
}
