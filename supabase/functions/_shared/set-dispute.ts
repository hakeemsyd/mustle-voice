import { normalizeSpokenNumbers, straightenQuotes } from './set-report.ts';

export const DUPLICATE_SET_GAP_MS = 30_000;

export type SetSource = 'voice' | 'typed' | 'tap' | 'coach';

export interface ProvenancedSet {
  weight: number | null;
  reps: number;
  unit?: 'seconds';
  at?: number;
  source?: SetSource;
}

export interface LikelyDuplicate {
  first: number;
  second: number;
  gapSec: number;
}

export const findLikelyDuplicate = (sets: ProvenancedSet[]): LikelyDuplicate | null => {
  if (sets.length < 2) return null;
  const a = sets[sets.length - 2];
  const b = sets[sets.length - 1];
  if (typeof a?.at !== 'number' || typeof b?.at !== 'number') return null;
  const gap = b.at - a.at;
  if (gap < 0 || gap > DUPLICATE_SET_GAP_MS) return null;
  if (a.reps !== b.reps || (a.weight ?? null) !== (b.weight ?? null) || (a.unit ?? null) !== (b.unit ?? null)) {
    return null;
  }
  return { first: sets.length - 1, second: sets.length, gapSec: Math.round(gap / 1000) };
};

const SOURCE_LABELS: Record<SetSource, string> = {
  voice: 'from what they said',
  typed: 'from what they typed',
  tap: 'from the Set done button',
  coach: 'from what they said in chat',
};

export const describeSetProvenance = (
  sets: ProvenancedSet[],
  formatLoad: (set: ProvenancedSet) => string,
): { list: string; warning: string | null } => {
  const list = sets
    .map((set, i) => {
      const notes: string[] = [];
      if (set.source && SOURCE_LABELS[set.source]) notes.push(`logged ${SOURCE_LABELS[set.source]}`);
      const previous = sets[i - 1];
      if (typeof set.at === 'number' && typeof previous?.at === 'number') {
        notes.push(`${Math.max(0, Math.round((set.at - previous.at) / 1000))}s after set ${i}`);
      }
      return `set ${i + 1}: ${formatLoad(set)}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
    })
    .join('; ');
  const duplicate = findLikelyDuplicate(sets);
  const warning = duplicate
    ? `- WARNING: sets ${duplicate.first} and ${duplicate.second} on this exercise are identical and were logged ` +
      `${duplicate.gapSec}s apart, which is almost certainly one set counted twice. If the user says the count is ` +
      'ahead, believe them and call undo_last_set.'
    : null;
  return { list, warning };
};

export interface SetCountDispute {
  exerciseIndex: number;
  exerciseName: string;
  totalSets: number;
  done: number;
  targetDone: number;
  autoUndo: boolean;
  matches: boolean;
}

interface DisputeState {
  target?: { type?: string } | null;
  exercises?: { name?: string; sets?: number }[];
  loggedSets?: ProvenancedSet[][];
  currentExerciseIndex?: number;
  ended?: boolean;
}

const ORDINAL_SETS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
};

const normalize = (text: string): string =>
  normalizeSpokenNumbers(straightenQuotes(text).toLowerCase())
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth)\s+set\b/g, (_m, word) => `set ${ORDINAL_SETS[word]}`)
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+set\b/g, 'set $1')
    .replace(/\bset\s+(?:number\s+|#\s*)(\d+)/g, 'set $1');

const NEGATION = "(?:haven't|havent|have\\s+not|hasn't|has\\s+not|hadn't|didn't|didnt|did\\s+not|never|not)";
const PERFORM =
  '(?:done|did|do|finished|finish|completed|complete|started|start|begun|begin|gotten\\s+to|got\\s+to|reached|performed|lifted)';

const NOT_DONE_BEFORE = new RegExp(
  `\\b${NEGATION}\\s+(?:even\\s+|actually\\s+|yet\\s+|really\\s+)?${PERFORM}\\s+(?:my\\s+|the\\s+|that\\s+)?set\\s*(\\d+)\\b`,
);
const NOT_DONE_AFTER =
  /\bset\s*(\d+)\s+(?:isn't|is\s+not|wasn't|was\s+not|hasn't|has\s+not|didn't|did\s+not|never|not)\s+(?:been\s+|even\s+|actually\s+|yet\s+)?(?:done|happen(?:ed)?|finished|complete(?:d)?|logged|started|performed)\b/;
const SHOULD_BE =
  /\b(?:should\s+(?:be|say|show|read)|supposed\s+to\s+(?:be|say|show|read)|meant\s+to\s+(?:be|say|show)|i'm\s+(?:still\s+|only\s+)?(?:on|at|doing|up\s+to)|i\s+am\s+(?:still\s+|only\s+)?(?:on|at|doing|up\s+to)|next\s+(?:one\s+|set\s+)?(?:should\s+be|has\s+to\s+be|needs\s+to\s+be))\s+(?:on\s+|at\s+|up\s+to\s+)?set\s*(\d+)\b/;
const ONLY_DID =
  /\bonly\s+(?:did|done|finished|completed|got\s+through|have\s+done)\s+(\d+)\s+sets?\b|\bonly\s+(\d+)\s+sets?\s+(?:done|so\s+far|finished|completed|in)\b/;
const COUNTED_TWICE =
  /\b(?:logged|counted|recorded|saved|added|entered)\s+(?:it\s+|that\s+|this\s+|one\s+|the\s+same\s+set\s+|that\s+set\s+|the\s+set\s+|my\s+set\s+|a\s+set\s+)?(?:twice|2\s+times|double)\b|\bdouble[-\s]?(?:counted|logged|recorded|count(?:ing)?|log(?:ging)?)\b|\b(?:added|logged|counted)\s+an?\s+extra\s+set\b/;
const SKIPPED = /\b(?:it|the\s+app|app|you)\s+(?:just\s+)?skipped\s+(?:a\s+set\b|(?:my\s+)?set\s*(\d+)\b)/;

const INTERROGATIVE =
  /^(?:did|do|does|have|has|had|is|was|are|were|should|shall|can|could|would|will|why|how|what|where|when|isn't|wasn't|didn't|haven't|hasn't)\b/;

const GENERIC_NAME_WORDS = new Set(['dumbbell', 'barbell', 'cable', 'machine', 'seated', 'standing', 'incline', 'decline', 'single', 'with']);

const mentionsExercise = (text: string, name: string | undefined): boolean =>
  !!name &&
  name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 4 && !GENERIC_NAME_WORDS.has(word))
    .some((word) => text.includes(word));

type Claim = { kind: 'set_not_done'; set: number } | { kind: 'next_is'; set: number } | { kind: 'only_did'; count: number } | { kind: 'one_extra' };

const claimIn = (sentence: string): Claim | null => {
  const notDone = sentence.match(NOT_DONE_BEFORE) ?? sentence.match(NOT_DONE_AFTER);
  if (notDone) return { kind: 'set_not_done', set: Number(notDone[1]) };
  const shouldBe = sentence.match(SHOULD_BE);
  if (shouldBe) return { kind: 'next_is', set: Number(shouldBe[1]) };
  const onlyDid = sentence.match(ONLY_DID);
  if (onlyDid) return { kind: 'only_did', count: Number(onlyDid[1] ?? onlyDid[2]) };
  const skipped = sentence.match(SKIPPED);
  if (skipped) return skipped[1] ? { kind: 'set_not_done', set: Number(skipped[1]) } : { kind: 'one_extra' };
  if (COUNTED_TWICE.test(sentence)) return { kind: 'one_extra' };
  return null;
};

type Verdict = { targetDone: number } | 'matches' | null;

const verdictFor = (claim: Claim, done: number): Verdict => {
  switch (claim.kind) {
    case 'set_not_done':
      if (claim.set < 1) return null;
      return claim.set <= done ? { targetDone: claim.set - 1 } : 'matches';
    case 'next_is':
      if (claim.set < 1) return null;
      if (claim.set <= done) return { targetDone: claim.set - 1 };
      return claim.set === done + 1 ? 'matches' : null;
    case 'only_did':
      if (claim.count < done) return { targetDone: claim.count };
      return claim.count === done ? 'matches' : null;
    case 'one_extra':
      return done >= 1 ? { targetDone: done - 1 } : null;
  }
};

const impliedNextSet = (claim: Claim): number | null =>
  claim.kind === 'set_not_done' || claim.kind === 'next_is' ? claim.set : claim.kind === 'only_did' ? claim.count + 1 : null;

const exerciseHoldingLastSet = (state: DisputeState, text: string): number | null => {
  const current = state.currentExerciseIndex ?? 0;
  const sets = state.loggedSets ?? [];
  if ((sets[current]?.length ?? 0) > 0) return current;
  for (let i = current - 1; i >= 0; i--) {
    if ((sets[i]?.length ?? 0) === 0) continue;
    return mentionsExercise(text, state.exercises?.[i]?.name) ? i : null;
  }
  return null;
};

export const detectSetCountDispute = (userText: string, state: DisputeState | null | undefined): SetCountDispute | null => {
  if (!state || state.ended || state.target?.type !== 'strength') return null;
  const text = normalize(userText ?? '');
  const sentences = straightenQuotes(userText ?? '')
    .toLowerCase()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !(INTERROGATIVE.test(sentence) && sentence.endsWith('?')))
    .map(normalize);

  const holding = exerciseHoldingLastSet(state, text);
  const index = holding ?? state.currentExerciseIndex ?? 0;
  const sets = state.loggedSets?.[index] ?? [];
  const done = sets.length;
  const exercise = state.exercises?.[index];
  const describe = (targetDone: number, autoUndo: boolean, matches: boolean): SetCountDispute => ({
    exerciseIndex: index,
    exerciseName: exercise?.name ?? 'this exercise',
    totalSets: Math.max(exercise?.sets ?? done, done),
    done,
    targetDone,
    autoUndo,
    matches,
  });

  for (const sentence of sentences) {
    const claim = claimIn(sentence);
    if (!claim) continue;
    const verdict = verdictFor(claim, done);
    if (verdict === null) continue;
    if (verdict === 'matches') {
      if (holding === null && impliedNextSet(claim) !== 1) continue;
      return describe(done, false, true);
    }
    if (holding === null) continue;
    const removeCount = done - verdict.targetDone;
    const autoUndo = claim.kind === 'one_extra' ? findLikelyDuplicate(sets) !== null : removeCount === 1;
    return describe(verdict.targetDone, autoUndo, false);
  }
  return null;
};

export type DisputeResolution = 'undone' | 'not_confirmed' | 'manual' | 'confirmed';

const SCREEN_RULE =
  'Never ask them what their screen, card or counter shows: the live session state block is exactly what their screen shows.';

export const describeDisputeOutcome = (
  dispute: SetCountDispute,
  resolution: DisputeResolution,
  header: string,
  restRunning: boolean | null = null,
): string => {
  const { exerciseName: name, totalSets: total, targetDone } = dispute;
  const next = targetDone + 1;
  const rest =
    restRunning === null
      ? ''
      : restRunning
        ? ' Their rest timer is running on screen.'
        : ` No rest timer is running: set ${next} can start whenever they are ready. Do not mention rest.`;
  if (resolution === 'confirmed') {
    return (
      `${header}\n- They said which set they are on, and the app already agrees: ${name} has ${dispute.done} of ` +
      `${total} sets done and the next set is set ${next} of ${total}. Nothing needs fixing and nothing was removed. ` +
      `Tell them they're right in a few words and name set ${next}.${rest} Do not call undo_last_set: the count is ` +
      `already correct, and removing a set now would delete one they really did. ${SCREEN_RULE}`
    );
  }
  if (resolution === 'undone') {
    return (
      `${header}\n- They said the app counted a set they had not done. The app has REMOVED the most recent set on ` +
      `${name} from the card and from the saved workout, so ${name} now has ${targetDone} of ${total} sets done and ` +
      `the next set is set ${next} of ${total}. Tell them it is fixed in one short line and name set ${next}.${rest} ` +
      `Do not call undo_last_set again and do not argue about the count. ${SCREEN_RULE}`
    );
  }
  if (resolution === 'not_confirmed') {
    return (
      `${header}\n- They said the app counted a set they had not done. The app was asked to remove the most recent ` +
      `set on ${name} but has not confirmed it yet. Tell them you have asked for that set to come off and the card ` +
      `should go back to set ${next} of ${total}. Do not call undo_last_set again. ${SCREEN_RULE}`
    );
  }
  const removeCount = dispute.done - targetDone;
  return (
    `${header}\n- They say the count on ${name} is ahead of what they actually did: ${dispute.done} of ${total} sets ` +
    `are logged and they say ${targetDone} ${targetDone === 1 ? 'is' : 'are'} done. Believe them. undo_last_set ` +
    `removes the most recent set; ${
      removeCount === 1
        ? 'call it once'
        : `confirm with them first that ${removeCount} sets should come off, then call it once per set`
    }, and then tell them the corrected count in one short line. Do not argue about the count. ${SCREEN_RULE}`
  );
};
