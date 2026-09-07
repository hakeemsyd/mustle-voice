import { normalizeSpokenNumbers } from '../onboarding/normalizeSpokenNumbers';

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
export function parseSetReport(raw: string): ParsedSet | null {
  const normalized = normalizeSpokenNumbers(raw);

  // Isometric/timed exercises (Plank, holds) report a duration, not a rep count — confirmed
  // live: "I held it for 52 seconds" matched nothing below and silently fell through to a
  // plain conversational reply. The held seconds fills the same `reps` slot the rest of the
  // app already reads for "how much of the target did they do" — bodyweight, no weight.
  const durationMatch = normalized.match(/(\d+)\s*(?:sec|secs|second|seconds)\b/i);
  if (durationMatch) {
    const reps = Math.round(Number(durationMatch[1]));
    return reps > 0 ? { weight: null, reps, unit: 'seconds' } : null;
  }

  const weightMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?|lb|lbs|pounds?)\b/i);
  const repsMatch = normalized.match(/(\d+)\s*(?:reps?|x)\b/i);

  if (weightMatch || repsMatch) {
    const weight = weightMatch ? Number(weightMatch[1]) : null;
    let reps = repsMatch ? Math.round(Number(repsMatch[1])) : null;

    // "60kg 8" — weight was pinned by its unit, so the remaining loose number is the reps.
    if (reps === null && weightMatch) {
      const leftover = normalized.replace(weightMatch[0], ' ').match(/\d+/);
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
  const positional = normalized.trim().match(
    /^(\d+(?:\.\d+)?)\s*(?:,|for|x|by)?\s*(\d+)\s*(?:reps?|times|each)?\.?$/i,
  );
  if (!positional) return null;

  const weight = Number(positional[1]);
  const reps = Math.round(Number(positional[2]));
  return reps > 0 ? { weight, reps } : null;
}

export function describeParsedSet(parsed: ParsedSet): string {
  if (parsed.unit === 'seconds') return `${parsed.reps}s held`;
  return parsed.weight === null
    ? `${parsed.reps} reps · bodyweight`
    : `${parsed.weight}kg × ${parsed.reps} reps`;
}

// Distinguishes "I did a set" from "hey coach, question" — the same split the design
// makes, so one field serves both without a mode toggle. Anything with a unit/rep
// keyword or a completion word is a report; everything else goes to the coach.
export function looksLikeSetReport(raw: string): boolean {
  if (parseSetReport(raw) !== null) return true;
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
