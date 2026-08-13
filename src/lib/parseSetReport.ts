import { normalizeSpokenNumbers } from '../onboarding/normalizeSpokenNumbers';

export interface ParsedSet {
  weight: number | null;
  reps: number;
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

  const matches = normalized.match(/\d+(\.\d+)?/g);
  if (!matches || matches.length < 2) return null;

  const weight = Number(matches[0]);
  const reps = Math.round(Number(matches[1]));
  return reps > 0 ? { weight, reps } : null;
}

export function describeParsedSet(parsed: ParsedSet): string {
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
