export type ExerciseMatch =
  | { kind: 'matched'; name: string }
  | { kind: 'not_found' }
  | { kind: 'ambiguous'; candidates: string[] };

const STOPWORDS = new Set(['the', 'a', 'my', 'to', 'back', 'on', 'and']);

const words = (value: string): string[] =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => w.replace(/(?:es|s)$/, ''))
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));

export function matchSessionExercise(sessionNames: string[], requested: string): ExerciseMatch {
  const target = requested.trim();
  if (!target) return { kind: 'not_found' };

  const exact = sessionNames.find((n) => n.trim().toLowerCase() === target.toLowerCase());
  if (exact) return { kind: 'matched', name: exact };

  const requestedWords = words(target);
  if (requestedWords.length === 0) return { kind: 'not_found' };

  const candidates = sessionNames.filter((name) => {
    const nameWords = new Set(words(name));
    return requestedWords.every((w) => nameWords.has(w));
  });

  if (candidates.length === 1) return { kind: 'matched', name: candidates[0] };
  if (candidates.length > 1) return { kind: 'ambiguous', candidates };
  return { kind: 'not_found' };
}
