const REP_KEYWORD = /\d+\s*(?:\+\s*)?reps?\b/i;
const REP_RANGE = /\b\d+\s*(?:-|–|—|to)\s*\d+\b/i;
const SETS_OF_N = /\bsets?\s+of\s+\d+/i;
const N_BY_M = /\b\d+\s*[x×]\s*\d+\b/i;
const OPEN_ENDED = /\b(?:amrap|to failure|max reps)\b/i;

export function statesRepTarget(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  return (
    REP_KEYWORD.test(value) ||
    REP_RANGE.test(value) ||
    SETS_OF_N.test(value) ||
    N_BY_M.test(value) ||
    OPEN_ENDED.test(value)
  );
}

export function repSchemeEchoesSetCount(repScheme: string | null | undefined, sets: number): boolean {
  const value = (repScheme ?? '').trim();
  if (!/^\d+$/.test(value)) return false;
  return Number(value) === sets;
}

const SET_NOTATION = /[x×]\s*\d+/gi;

export function describeImportedWorkout(currentUserText: string | null | undefined): string | null {
  const text = (currentUserText ?? '').trim();
  if (!text) return null;
  const notations = text.match(SET_NOTATION);
  if (!notations || notations.length < 2) return null;
  if (statesRepTarget(text)) return null;

  return (
    'The user just handed you their own written workout. It uses "xN" notation, which states how ' +
    'many SETS and gives NO rep target anywhere. Two things follow, and both are non-negotiable ' +
    'this turn. First: call create_custom_session now, without confirm, before you state a single ' +
    'number back to them — it saves nothing and returns the session to read from, and anything you ' +
    'say about sets, reps or weights before that call is your own guess. Second: you do not have a ' +
    'rep target for these exercises, so do not state one. Repeating the set count as the rep count ' +
    '("5 sets, 5 reps" off "x5") is the specific error being watched for here and the tool will ' +
    'reject it. Ask them what rep target they want, or use their logged history and say that is ' +
    'what you did.'
  );
}

export function findInventedRepTargets(
  exercises: { name: string; sets: number; rep_scheme?: string | null }[],
  currentUserText: string | null | undefined,
): string[] {
  if (statesRepTarget(currentUserText)) return [];
  return exercises
    .filter((e) => repSchemeEchoesSetCount(e.rep_scheme, e.sets))
    .map((e) => e.name);
}
