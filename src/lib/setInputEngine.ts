import {
  classifySpokenSet,
  COACH_ASKS_FOR_SET_DETAILS,
  confirmsSetDone,
  detectSetCorrection,
  isBareRepCount,
  isImplausibleWeightJump,
  isNegation,
  isAffirmation,
  isRestatement,
  looksLikeRestQuery,
  looksLikeRestRequest,
  normalizeSpokenNumbers,
  looksLikeStartSetCommand,
  looksLikeUndoRequest,
  looksLikeMisheardUndo,
  needsWeightBeforeLogging,
  parseRestChangeRequest,
  parseSetReport,
  parseWeightReply,
  plannedWeightKg,
  resolveReportedWeight,
  SET_PARSER_VERSION,
  type KnownWeights,
  type ParsedSet,
  type RestChangeRequest,
} from '../../supabase/functions/_shared/set-report';
import { describeRestScope, type RestLengthScope } from '../../supabase/functions/_shared/rest-length';
import { isBodyweightWork, isTimedExercise } from './exerciseCatalog';
import { kgToDisplayWeight, type Units } from './units';
import { formatClock } from './formatClock';

export const HOLD_MS = 120_000;

export interface EngineExercise {
  name: string;
  sets: number;
  repScheme: string;
  loadScheme: string | null;
}

export interface EngineLoggedSet {
  weight: number | null;
  reps: number;
  unit?: 'seconds';
  at?: number;
}

export interface EngineState {
  exercises: EngineExercise[];
  currentExerciseIndex: number;
  loggedSets: EngineLoggedSet[][];
  resting: boolean;
  restRemainingSec: number | null;
  restFinishedAt: number | null;
  statedWeight: { exerciseIndex: number; weight: number; at?: number } | null;
  units: Units;
  lastCoachLine: string | null;
  lastTypedLog?: { text: string; at: number } | null;
  now: number;
}

export const DUPLICATE_SEND_MS = 6_000;

const isDuplicateSend = (text: string, source: EngineSource, state: EngineState): boolean => {
  if (source === 'voice') return false;
  const previous = state.lastTypedLog;
  if (!previous || !carriesNumbers(text)) return false;
  return previous.text.trim().toLowerCase() === text.trim().toLowerCase() && state.now - previous.at < DUPLICATE_SEND_MS;
};

interface Hold {
  exerciseIndex: number;
  at: number;
}

export interface EngineHolds {
  weight: (Hold & { reps: number; asks: number }) | null;
  done: (Hold & { set: ParsedSet }) | null;
  weightCheck: (Hold & { set: ParsedSet }) | null;
  details: Hold | null;
  amend: (Hold & { setIndex: number; set: ParsedSet }) | null;
  undoCheck: Hold | null;
}

export const NO_HOLDS: EngineHolds = {
  weight: null,
  done: null,
  weightCheck: null,
  details: null,
  amend: null,
  undoCheck: null,
};

export type EngineSource = 'typed' | 'voice' | 'tap';

export type EngineEffect =
  | { type: 'log'; weight: number | null; reps: number; unit?: 'seconds' }
  | { type: 'amend'; exerciseIndex: number; setIndex: number; weight: number | null; reps: number }
  | { type: 'announce'; text: string }
  | { type: 'set_rest_length'; seconds: number; scope: RestLengthScope }
  | { type: 'extend_rest'; seconds: number }
  | { type: 'finish_rest' }
  | { type: 'start_next_set' }
  | { type: 'undo' }
  | { type: 'remember_weight'; weight: number }
  | { type: 'tell_coach'; text: string };

export interface EngineResult {
  handled: boolean;
  effects: EngineEffect[];
  holds: EngineHolds;
  draft?: string;
}

const PRONOUN_ONE = /\b(?:that|this|the|last|each|another|which)\s+one\b/gi;

const ABANDON_HOLD =
  /^(?:skip(?:\s+it)?|drop\s+(?:it|them|that)|forget\s+(?:it|them|that)|cancel(?:\s+(?:it|that))?|never\s*mind|leave\s+it|don'?t\s+log\s+(?:it|that|them))[\s.!]*$/i;

const carriesNumbers = (text: string): boolean => /\d/.test(normalizeSpokenNumbers(text.replace(PRONOUN_ONE, ' ')));

const EXPLICIT_START = /\b(?:start|begin|starting|kick\s+off)\b/i;
const EXPLICIT_WEIGHT_UNIT = /\b(?:lb|lbs|pound|pounds|kg|kgs|kilo|kilos|kilogram|kilograms)\b/i;

const START_VERB = /^(?:(?:ok(?:ay)?|alright|all\s+right|right|so|and|yeah|yep|now|hey)\b[\s.,!?]*)*(?:let'?s\s+)?(?:start(?:ing)?|begin(?:ning)?|do|go\s+to|jump\s+to|move\s+to|on\s+to)\b/i;
const NEXT_THING = /^(?:the\s+|my\s+|this\s+|that\s+)?(?:next\s+)?(?:exercise|one|movement|lift)\b/i;

const wordsOf = (text: string): string[] =>
  (text ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word));

const STOPWORDS = new Set(['the', 'a', 'my', 'this', 'that', 'now', 'please', 'up', 'on', 'to']);

const namesExercise = (text: string, exerciseName: string): boolean => {
  const wanted = wordsOf(exerciseName).filter((word) => !STOPWORDS.has(word));
  if (wanted.length === 0) return false;
  const said = new Set(wordsOf(text));
  return wanted.every((word) => said.has(word));
};

const startsNamedExercise = (text: string, exerciseName: string): boolean => {
  const trimmed = text.trim();
  const verb = trimmed.match(START_VERB);
  if (!verb) return false;
  const rest = trimmed.slice(verb[0].length).trim().replace(/[.!?]+$/, '').trim();
  if (!rest) return false;
  return NEXT_THING.test(rest) || namesExercise(rest, exerciseName);
};

const readStartSetCommand = (text: string, units: Units, exerciseName: string): { start: boolean; weight: number | null } => {
  if (looksLikeStartSetCommand(text)) return { start: true, weight: null };
  if (startsNamedExercise(text, exerciseName)) return { start: true, weight: null };
  const clauses = text.split(/[.;,!?]+/).map((part) => part.trim()).filter(Boolean);
  if (clauses.length < 2) return { start: false, weight: null };
  let start = false;
  let weight: number | null = null;
  for (const clause of clauses) {
    if (EXPLICIT_START.test(clause) && looksLikeStartSetCommand(clause)) {
      if (start) return { start: false, weight: null };
      start = true;
      continue;
    }
    if (!EXPLICIT_WEIGHT_UNIT.test(clause)) return { start: false, weight: null };
    const reply = parseWeightReply(clause, units);
    if (reply?.weight == null || reply.weight <= 0 || weight !== null) return { start: false, weight: null };
    weight = reply.weight;
  }
  return start && weight !== null ? { start, weight } : { start: false, weight: null };
};

const isFresh = <T extends Hold>(hold: T | null, state: EngineState): hold is T =>
  !!hold && hold.exerciseIndex === state.currentExerciseIndex && state.now - hold.at < HOLD_MS;

const AMEND_HOLD_MS = 45_000;

const isPending = <T extends Hold>(hold: T | null, state: EngineState): hold is T =>
  !!hold && state.now - hold.at < AMEND_HOLD_MS;

const describeRepScheme = (scheme: string): string =>
  /^\d+(\s*[-–]\s*\d+)?$/.test(scheme.trim()) ? `${scheme.trim()} reps` : scheme.trim();

export const describeSetForUser = (set: { weight: number | null; reps: number; unit?: 'seconds' }, units: Units): string => {
  if (set.unit === 'seconds') {
    return set.reps >= 60 && set.reps % 60 === 0 ? `${set.reps / 60} min` : `${set.reps}s held`;
  }
  return set.weight === null ? `${set.reps} reps · bodyweight` : `${kgToDisplayWeight(set.weight, units)} × ${set.reps} reps`;
};

const describeHeldSet = (
  set: { weight: number | null; reps: number; unit?: 'seconds' },
  ctx: { bodyweight: boolean },
  units: Units,
): string => (set.weight === null && set.unit !== 'seconds' && !ctx.bodyweight ? `${set.reps} reps` : describeSetForUser(set, units));

const latestSetTime = (loggedSets: EngineLoggedSet[][]): number | null => {
  const times = loggedSets.flat().map((set) => set.at).filter((at): at is number => typeof at === 'number');
  return times.length > 0 ? Math.max(...times) : null;
};

export const mostRecentSet = (
  state: Pick<EngineState, 'loggedSets' | 'currentExerciseIndex'>,
): { exerciseIndex: number; setIndex: number; set: EngineLoggedSet } | null => {
  let best: { exerciseIndex: number; setIndex: number; set: EngineLoggedSet } | null = null;
  state.loggedSets.forEach((sets, exerciseIndex) =>
    sets.forEach((set, setIndex) => {
      if (typeof set.at !== 'number') return;
      if (!best || (best.set.at ?? 0) <= set.at) best = { exerciseIndex, setIndex, set };
    }),
  );
  if (best) return best;
  for (let i = Math.min(state.currentExerciseIndex, state.loggedSets.length - 1); i >= 0; i--) {
    const sets = state.loggedSets[i] ?? [];
    if (sets.length > 0) return { exerciseIndex: i, setIndex: sets.length - 1, set: sets[sets.length - 1] };
  }
  return null;
};

interface Context {
  state: EngineState;
  exercise: EngineExercise;
  index: number;
  setsHere: EngineLoggedSet[];
  setNumber: number;
  known: KnownWeights;
  bodyweight: boolean;
  timed: boolean;
}

const contextOf = (state: EngineState): Context | null => {
  const exercise = state.exercises[state.currentExerciseIndex];
  if (!exercise) return null;
  const setsHere = state.loggedSets[state.currentExerciseIndex] ?? [];
  const lastWeighted = [...setsHere].reverse().find((set) => set.weight !== null && set.unit !== 'seconds');
  const lastLogged = lastWeighted?.weight ?? null;
  const stated = state.statedWeight?.exerciseIndex === state.currentExerciseIndex ? state.statedWeight : null;
  return {
    state,
    exercise,
    index: state.currentExerciseIndex,
    setsHere,
    setNumber: setsHere.length + 1,
    known: {
      lastLogged,
      stated: stated?.weight ?? null,
      planned: plannedWeightKg(exercise.loadScheme),
      statedIsNewer: stated?.at != null && (lastWeighted?.at == null || stated.at > lastWeighted.at),
    },
    bodyweight: isBodyweightWork(exercise.name, exercise.loadScheme),
    timed: isTimedExercise(exercise.name),
  };
};

export const knownWeightFor = (state: EngineState): number | null => {
  const ctx = contextOf(state);
  return ctx ? resolveReportedWeight({ weight: null, reps: 0 }, ctx.known) : null;
};

const setLabel = (ctx: Context): string => `set ${ctx.setNumber} of ${ctx.exercise.sets} on ${ctx.exercise.name}`;

const settle = (
  ctx: Context,
  set: ParsedSet,
  weightGiven: boolean,
  source: EngineSource,
  holds: EngineHolds,
  effects: EngineEffect[],
): EngineResult => {
  const { state } = ctx;
  const weight = weightGiven ? set.weight : resolveReportedWeight(set, ctx.known);
  const resolved: ParsedSet = { ...set, weight };
  if (!weightGiven && needsWeightBeforeLogging(resolved, null, ctx.bodyweight)) {
    const previous = isFresh(holds.weight, state) && holds.weight.reps === set.reps ? holds.weight.asks : 0;
    const next: EngineHolds = {
      ...holds,
      weight: { exerciseIndex: ctx.index, at: state.now, reps: set.reps, asks: previous + 1 },
    };
    const heldNote =
      `The app is holding ${set.reps} reps for ${setLabel(ctx)} and has NOT logged them, because it has no ` +
      `weight for this exercise yet. Nothing is saved and the workout cannot move on until they give one. ` +
      `These reps are NOT a logged set: if they say they did not do it, or ask to undo or remove it, there is ` +
      `nothing to undo — say so and drop the held reps. NEVER call undo_last_set here; the most recent logged ` +
      `set belongs to an earlier exercise and deleting it would destroy real data. Do not ask if they are ` +
      `ready for this set, do not announce the set, and do not move to another exercise.`;
    if (source === 'voice') {
      return {
        handled: true,
        effects: [
          ...effects,
          { type: 'tell_coach', text: `${heldNote} Ask them only for the weight, in a few words.` },
        ],
        holds: next,
      };
    }
    const text =
      previous === 0
        ? `Got ${set.reps} reps. What weight was that? Nothing logged yet.`
        : `I still need the weight for those ${set.reps} reps before I can log ${setLabel(ctx)}. Say or type just ` +
          `the weight, like "${state.units === 'imperial' ? '25 lb' : '10 kg'}", or "bodyweight", or "skip" to drop them.`;
    const coachNote: EngineEffect = {
      type: 'tell_coach',
      text:
        `${heldNote} The app has ALREADY asked them for the weight on screen, in these words: "${text}" — ` +
        `so do not ask again and do not rephrase it. Reply with nothing at all unless they asked you something ` +
        `else in this message.`,
    };
    return { handled: true, effects: [...effects, { type: 'announce', text }, coachNote], holds: next };
  }
  const reference = ctx.known.lastLogged ?? ctx.known.planned;
  if (!weightGiven || set.weight !== null) {
    if (isImplausibleWeightJump(resolved.weight, reference)) {
      const heard = kgToDisplayWeight(resolved.weight as number, state.units);
      const expected = kgToDisplayWeight(reference as number, state.units);
      return {
        handled: true,
        effects: [
          ...effects,
          { type: 'announce', text: `That came through as ${heard}, but you were on ${expected}. Nothing logged yet — was that right?` },
          {
            type: 'tell_coach',
            text:
              `IMPORTANT: the app heard ${heard} for this set, but the working weight here is ${expected}. ` +
              `That is too big a jump to trust, so NOTHING was logged and the app is still waiting on ${setLabel(ctx)}. ` +
              `Ask them once, briefly, to confirm the weight — do not count this set until they do.`,
          },
        ],
        holds: { ...holds, weight: null, weightCheck: { exerciseIndex: ctx.index, at: state.now, set: resolved } },
      };
    }
  }
  return {
    handled: true,
    effects: [...effects, { type: 'log', weight: resolved.weight, reps: resolved.reps, unit: resolved.unit }],
    holds: { ...holds, weight: null, weightCheck: null, details: null, done: null },
  };
};

const announce = (source: EngineSource, text: string): EngineEffect[] =>
  source === 'voice' ? [] : [{ type: 'announce', text }];

const restChangeEffects = (change: RestChangeRequest, ctx: Context): EngineEffect[] => {
  const { resting } = ctx.state;
  if (change.kind === 'extend') {
    if (!resting) return [{ type: 'announce', text: 'No rest is running right now, so there is nothing to add time to.' }];
    return [
      { type: 'extend_rest', seconds: change.seconds },
      { type: 'announce', text: `Added ${formatRestLength(change.seconds)} to this rest. Later rests are unchanged.` },
    ];
  }
  const length = formatRestLength(change.seconds);
  if (change.scope === 'current') {
    if (!resting) {
      return [
        {
          type: 'announce',
          text: `No rest is running right now. To change the rests for ${ctx.exercise.name}, say "make it ${length}".`,
        },
      ];
    }
    return [
      { type: 'set_rest_length', seconds: change.seconds, scope: 'current' },
      { type: 'announce', text: `This rest is now ${length}. Later rests are unchanged.` },
    ];
  }
  return [
    { type: 'set_rest_length', seconds: change.seconds, scope: change.scope },
    { type: 'announce', text: `Rest set to ${length} ${describeRestScope(change.scope, ctx.exercise.name, resting)}.` },
  ];
};

export const decideSetInput = (
  raw: string,
  source: EngineSource,
  state: EngineState,
  inHolds: EngineHolds,
): EngineResult => {
  const text = raw.trim();
  const ctx = contextOf(state);
  if (!text || !ctx) return { handled: false, effects: [], holds: inHolds };
  if (isDuplicateSend(text, source, state)) {
    return {
      handled: true,
      effects: [
        {
          type: 'announce',
          text: `That's the same message twice within a few seconds, so I logged it once. Send it again if it really was another set.`,
        },
      ],
      holds: inHolds,
    };
  }
  const { units } = state;
  const typed = source !== 'voice';
  let holds: EngineHolds = { ...inHolds };

  if (isPending(holds.undoCheck, state)) {
    holds = { ...holds, undoCheck: null };
    if (isAffirmation(text)) {
      const last = mostRecentSet(state);
      return {
        handled: true,
        effects: last
          ? [
              { type: 'undo' },
              {
                type: 'tell_coach',
                text:
                  `The app has just removed a set. ${describeUndo(state)} The "Sets COMPLETED" count above was ` +
                  `written BEFORE this and is now one too high. Say only that it is removed and which set is open ` +
                  `again, using those exact numbers. Do not work the set number out yourself and do not say the ` +
                  `workout is finished.`,
              },
            ]
          : announce(source, 'Nothing is logged yet, so there is nothing to undo.'),
        holds: NO_HOLDS,
      };
    }
    if (isNegation(text)) {
      return { handled: true, effects: announce(source, 'Okay, nothing removed.'), holds };
    }
  }

  if (isPending(holds.amend, state) && !confirmsSetDone(text)) {
    const held = holds.amend;
    holds = { ...holds, amend: null };
    if (isNegation(text)) {
      return { handled: true, effects: announce(source, 'Okay, left as it was.'), holds };
    }
    const parsed =
      parseSetReport(text, units, { allowPositional: true, version: SET_PARSER_VERSION }) ??
      (() => {
        const reply = parseWeightReply(text, units);
        return reply ? { weight: reply.weight, reps: held.set.reps } : null;
      })();
    if (parsed) {
      const name = state.exercises[held.exerciseIndex]?.name ?? 'that exercise';
      const weight = parsed.weight !== null ? parsed.weight : held.set.weight;
      const summary = describeSetForUser({ weight, reps: parsed.reps }, units);
      return {
        handled: true,
        effects: [
          { type: 'amend', exerciseIndex: held.exerciseIndex, setIndex: held.setIndex, weight, reps: parsed.reps },
          ...announce(source, `Fixed: ${name} set ${held.setIndex + 1} is now ${summary}. Nothing new was logged.`),
          {
            type: 'tell_coach',
            text:
              `The app has ALREADY corrected this: ${name} set ${held.setIndex + 1} is now ${summary}, and nothing ` +
              `new was logged. It is done, so never say you cannot change it, never say you have no tool for it, and ` +
              `never ask what their screen shows. Acknowledge the corrected numbers in a few words and move on.`,
          },
        ],
        holds: { ...holds, done: null, weight: null, weightCheck: null, details: null },
      };
    }
  }

  if (isFresh(holds.weightCheck, state)) {
    const held = holds.weightCheck;
    if (isAffirmation(text)) {
      holds = { ...holds, weightCheck: null };
      return {
        handled: true,
        effects: [{ type: 'log', weight: held.set.weight, reps: held.set.reps, unit: held.set.unit }],
        holds: { ...holds, details: null, done: null, weight: null },
      };
    }
    if (isNegation(text)) {
      return {
        handled: true,
        effects: announce(source, 'Okay, nothing logged. How many reps did you get, and at what weight?'),
        holds: { ...holds, weightCheck: null, details: { exerciseIndex: ctx.index, at: state.now } },
      };
    }
  }

  const heldDone = isFresh(holds.done, state) ? holds.done : null;
  holds = { ...holds, done: null };
  if (heldDone) {
    if (isNegation(text)) {
      return { handled: true, effects: announce(source, `Okay, not logged. ${capitalize(setLabel(ctx))} is still open.`), holds };
    }
    if (confirmsSetDone(text) && !carriesNumbers(text)) {
      const effects: EngineEffect[] = state.resting ? [{ type: 'finish_rest' }] : [];
      return settle(ctx, heldDone.set, false, source, holds, effects);
    }
  }

  if (isFresh(holds.weight, state)) {
    const reply = parseWeightReply(text, units);
    if (reply) {
      return settle(ctx, { weight: reply.weight, reps: holds.weight.reps }, true, source, { ...holds, weight: null }, []);
    }
    if (ABANDON_HOLD.test(text)) {
      return {
        handled: true,
        effects: [
          ...announce(source, `Dropped those ${holds.weight.reps} reps — nothing logged. ${capitalize(setLabel(ctx))} is still open.`),
          {
            type: 'tell_coach',
            text:
              `They chose not to give a weight, so the app dropped the reps it was holding. Nothing was logged and ` +
              `${setLabel(ctx)} is still open. Acknowledge in a few words and carry on.`,
          },
        ],
        holds: { ...holds, weight: null },
      };
    }
  }

  if (looksLikeMisheardUndo(text)) {
    const last = mostRecentSet(state);
    const exercise = last ? state.exercises[last.exerciseIndex] : null;
    if (!last || !exercise) {
      return {
        handled: true,
        effects: announce(source, 'Nothing is logged yet, so there is nothing to undo.'),
        holds: NO_HOLDS,
      };
    }
    const described = `${exercise.name} set ${last.setIndex + 1} (${describeSetForUser(last.set, units)})`;
    return {
      handled: true,
      effects: [
        { type: 'announce', text: `Did you mean undo? That would remove ${described}. Say "yes" to remove it.` },
        {
          type: 'tell_coach',
          text:
            `That came through garbled and may have been "undo the last set". The app has ALREADY asked them ` +
            `"Did you mean undo? That would remove ${described}." — do not ask anything of your own and do not ` +
            `remove anything yourself. Nothing has been removed. Say nothing unless they asked something else.`,
        },
      ],
      holds: { ...NO_HOLDS, undoCheck: { exerciseIndex: ctx.index, at: state.now } },
    };
  }

  const restChange = parseRestChangeRequest(text, { resting: state.resting, timedExercise: ctx.timed });
  if (restChange) {
    return { handled: true, effects: typed ? restChangeEffects(restChange, ctx) : [], holds };
  }

  if (typed) {
    if (looksLikeUndoRequest(text)) {
      const pending =
        isFresh(heldDone, state) || isFresh(holds.weightCheck, state) || isFresh(holds.weight, state);
      if (pending) {
        return {
          handled: true,
          effects: [{ type: 'announce', text: `Okay, not logged. ${capitalize(setLabel(ctx))} is still open.` }],
          holds: NO_HOLDS,
        };
      }
      const last = mostRecentSet(state);
      return {
        handled: true,
        effects: last
          ? [
              { type: 'undo' },
              {
                type: 'tell_coach',
                text:
                  `The app has just removed a set. ${describeUndo(state)} The "Sets COMPLETED" count above was ` +
                  `written BEFORE this and is now one too high. Say only that it is removed and which set is open ` +
                  `again, using those exact numbers. Do not work the set number out yourself and do not say the ` +
                  `workout is finished.`,
              },
            ]
          : [{ type: 'announce', text: 'Nothing is logged yet, so there is nothing to undo.' }],
        holds: NO_HOLDS,
      };
    }
    if (looksLikeRestQuery(text)) {
      const left = state.restRemainingSec;
      const next = describeNextSetLine(state);
      return {
        handled: true,
        effects: [
          {
            type: 'announce',
            text: state.resting
              ? `${left != null ? `${formatClock(left)} of rest left` : 'Rest is running'}. Say "let's go" when you're ready.`
              : `No rest is running right now.${next ? ` Next up: ${next}` : ''}`,
          },
        ],
        holds,
      };
    }
    if (looksLikeRestRequest(text) && !(state.resting && looksLikeStartSetCommand(text))) {
      if (state.resting) {
        const left = state.restRemainingSec;
        return {
          handled: true,
          effects: [
            {
              type: 'announce',
              text: `Rest is running${left != null ? `: ${formatClock(left)} left` : ''}. Say "let's go" when you're ready.`,
            },
          ],
          holds,
        };
      }
      return {
        handled: true,
        effects: [
          {
            type: 'announce',
            text: `Nothing is logged for ${setLabel(ctx)} yet, so no rest is running. How many reps did you get?`,
          },
        ],
        holds: { ...holds, details: { exerciseIndex: ctx.index, at: state.now } },
      };
    }
  }

  const startSet = state.resting ? readStartSetCommand(text, state.units, state.exercises[ctx.index]?.name ?? '') : { start: false, weight: null };
  if (startSet.start) {
    return {
      handled: true,
      effects:
        startSet.weight === null
          ? [{ type: 'start_next_set' }]
          : [{ type: 'remember_weight', weight: startSet.weight }, { type: 'start_next_set' }],
      holds: { ...holds, done: null },
    };
  }

  const last = mostRecentSet(state);
  const correction = last ? detectSetCorrection(text, units, last.set, SET_PARSER_VERSION, { resting: state.resting }) : null;
  if (last && correction?.kind === 'correction') {
    const weight = correction.weight !== undefined ? correction.weight : last.set.weight;
    const reps = correction.reps ?? last.set.reps;
    const exerciseName = state.exercises[last.exerciseIndex]?.name ?? 'that exercise';
    const summary = describeSetForUser({ weight, reps }, units);
    return {
      handled: true,
      effects: [
        { type: 'amend', exerciseIndex: last.exerciseIndex, setIndex: last.setIndex, weight, reps },
        ...announce(
          source,
          `Fixed: ${exerciseName} set ${last.setIndex + 1} is now ${summary}. Nothing new was logged.`,
        ),
        {
          type: 'tell_coach',
          text:
            `The app has ALREADY corrected this: ${exerciseName} set ${last.setIndex + 1} is now ${summary}, and ` +
            `nothing new was logged. It is done, so never say you cannot change it, never ask them to confirm it, ` +
            `and never ask what their screen shows. Acknowledge the corrected numbers in a few words and move on.`,
        },
      ],
      holds: { ...holds, weight: null, weightCheck: null, done: null },
    };
  }
  if (last && correction?.kind === 'unclear') {
    const exerciseName = state.exercises[last.exerciseIndex]?.name ?? 'that exercise';
    const saved = describeSetForUser(last.set, units);
    return {
      handled: true,
      effects: [
        {
          type: 'announce',
          text:
            `What should ${exerciseName} set ${last.setIndex + 1} be? It's saved as ${saved}.` +
            (typed ? ` Type it like "${units === 'imperial' ? '40 lb' : '20 kg'}, 8 reps".` : ''),
        },
        {
          type: 'tell_coach',
          text:
            `The app is waiting on a correction to ${exerciseName} set ${last.setIndex + 1}, currently saved as ` +
            `${saved}. The app has ALREADY asked them "What should ${exerciseName} set ${last.setIndex + 1} be?" — ` +
            `do not ask it again and do not add a question of your own. Whatever numbers they give next will correct ` +
            `THAT set; it is NOT a new set. Say nothing unless they asked something else.`,
        },
      ],
      holds: { ...holds, amend: { exerciseIndex: last.exerciseIndex, setIndex: last.setIndex, set: last.set, at: state.now } },
    };
  }

  const awaitingDetails =
    isFresh(holds.details, state) || (typed && COACH_ASKS_FOR_SET_DETAILS.test(state.lastCoachLine ?? ''));
  const intent = classifySpokenSet(text, units, {
    awaitingDetails,
    timedExercise: ctx.timed,
    typed,
    confirmsBareReps: true,
    resting: state.resting,
    version: SET_PARSER_VERSION,
    confirmed: source === 'tap',
    exerciseHasLoggedSets: (state.loggedSets[ctx.index]?.length ?? 0) > 0,
  });

  if (intent.kind === 'ignore') {
    const bare = typed && !ctx.timed ? isBareRepCount(text) : null;
    if (bare !== null) {
      const known = resolveReportedWeight({ weight: null, reps: bare }, ctx.known);
      const at = known !== null ? ` at ${kgToDisplayWeight(known, units)}` : '';
      return {
        handled: true,
        effects: [{ type: 'announce', text: `${bare} reps for ${setLabel(ctx)}${at}? Reply "yes" to log it.` }],
        holds: { ...holds, done: { exerciseIndex: ctx.index, at: state.now, set: { weight: null, reps: bare } } },
      };
    }
    return { handled: false, effects: [], holds };
  }

  if (intent.kind === 'stated_weight') {
    return { handled: false, effects: [{ type: 'remember_weight', weight: intent.weight }], holds };
  }

  if (intent.kind === 'needs_details') {
    return {
      handled: true,
      effects: announce(source, 'How many reps did you get?'),
      holds: { ...holds, details: { exerciseIndex: ctx.index, at: state.now } },
    };
  }

  const restatableAt = latestSetTime([state.loggedSets[ctx.index] ?? []]);
  if (isRestatement(restatableAt, state.now, state.restFinishedAt)) {
    if (!typed) return { handled: true, effects: [], holds: { ...holds, details: null } };
    const lastAt = restatableAt ?? state.now;
    const seconds = Math.max(1, Math.round((state.now - lastAt) / 1000));
    const lastLogged = mostRecentSet(state);
    const lastName = lastLogged ? state.exercises[lastLogged.exerciseIndex]?.name : null;
    const described = describeHeldSet({ ...intent.set, weight: resolveReportedWeight(intent.set, ctx.known) }, ctx, units);
    return {
      handled: true,
      effects: [
        {
          type: 'announce',
          text:
            `${lastName && lastLogged ? `${lastName} set ${lastLogged.setIndex + 1}` : 'Your last set'} was logged ` +
            `${seconds}s ago. Log another one now as ${setLabel(ctx)}, ${described}? Reply "yes" to log it.`,
        },
      ],
      holds: { ...holds, done: { exerciseIndex: ctx.index, at: state.now, set: intent.set } },
    };
  }

  if (intent.kind === 'unconfirmed') {
    const weight = resolveReportedWeight(intent.set, ctx.known);
    if (typed && needsWeightBeforeLogging({ ...intent.set, weight }, null, ctx.bodyweight)) {
      return settle(ctx, intent.set, false, source, holds, state.resting ? [{ type: 'finish_rest' }] : []);
    }
    const described = describeHeldSet({ ...intent.set, weight }, ctx, units);
    return {
      handled: true,
      effects: announce(
        source,
        `Log ${described} as ${setLabel(ctx)}? Reply "yes"${state.resting ? '' : ', or tap Confirm set'}.`,
      ),
      holds: { ...holds, done: { exerciseIndex: ctx.index, at: state.now, set: intent.set } },
    };
  }

  const effects: EngineEffect[] = state.resting ? [{ type: 'finish_rest' }] : [];
  return settle(ctx, intent.set, false, source, { ...holds, details: null }, effects);
};

export const decideConfirmTap = (draft: string, state: EngineState, holds: EngineHolds): EngineResult => {
  const ctx = contextOf(state);
  if (!ctx || state.resting) return { handled: false, effects: [], holds };
  const text = draft.trim();
  if (!text && isFresh(holds.done, state)) {
    return settle(ctx, holds.done.set, false, 'tap', { ...holds, done: null }, []);
  }
  if (isFresh(holds.weight, state)) {
    if (!text) {
      return {
        handled: true,
        effects: [
          {
            type: 'announce',
            text:
              `Say or type the weight for those ${holds.weight.reps} reps, like ` +
              `"${state.units === 'imperial' ? '25 lb' : '10 kg'}", or "bodyweight". Say "skip" to drop them and move on.`,
          },
        ],
        holds,
      };
    }
    return decideSetInput(text, 'tap', state, holds);
  }
  if (text) {
    if (parseSetReport(text, state.units, { timedExercise: ctx.timed, allowPositional: true })) {
      return decideSetInput(text, 'tap', { ...state, lastCoachLine: null }, holds);
    }
    return decideSetInput(text, 'tap', state, holds);
  }
  const reps = targetRepsOf(ctx.exercise.repScheme);
  if (reps === null) return { handled: false, effects: [], holds };
  const weight = ctx.timed ? null : resolveReportedWeight({ weight: null, reps }, ctx.known);
  return {
    handled: true,
    effects: [],
    holds,
    draft: weight !== null ? `${kgToDisplayWeight(weight, state.units)} ${reps} reps` : `${reps} reps`,
  };
};

const targetRepsOf = (repScheme: string): number | null => {
  const numbers = repScheme.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  return Math.max(...numbers.map(Number));
};

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const describeUndo = (state: EngineState): string => {
  const last = mostRecentSet(state);
  const exercise = last ? state.exercises[last.exerciseIndex] : null;
  if (!last || !exercise) return 'Nothing is logged yet, so there is nothing to undo.';
  return (
    `Removed ${exercise.name} set ${last.setIndex + 1} (${describeSetForUser(last.set, state.units)}). ` +
    `Set ${last.setIndex + 1} of ${exercise.sets} on ${exercise.name} is open again.`
  );
};

export const formatRestLength = (seconds: number): string => {
  if (seconds % 60 !== 0) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
};

export const describeNextSetLine = (state: EngineState): string | null => {
  const ctx = contextOf(state);
  if (!ctx) return null;
  const weight = ctx.timed ? null : resolveReportedWeight({ weight: null, reps: 0 }, ctx.known);
  return (
    `Set ${ctx.setNumber} of ${ctx.exercise.sets} on ${ctx.exercise.name}: ${describeRepScheme(ctx.exercise.repScheme)}` +
    `${weight != null ? ` at ${kgToDisplayWeight(weight, state.units)}` : ''}.`
  );
};
