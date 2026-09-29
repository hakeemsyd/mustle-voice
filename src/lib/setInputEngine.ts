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
  needsWeightBeforeLogging,
  parseRestChangeRequest,
  parseSetReport,
  parseWeightReply,
  plannedWeightKg,
  resolveReportedWeight,
  SET_PARSER_VERSION,
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
  statedWeight: { exerciseIndex: number; weight: number } | null;
  units: Units;
  lastCoachLine: string | null;
  now: number;
}

interface Hold {
  exerciseIndex: number;
  at: number;
}

export interface EngineHolds {
  weight: (Hold & { reps: number; asks: number }) | null;
  done: (Hold & { set: ParsedSet }) | null;
  weightCheck: (Hold & { set: ParsedSet }) | null;
  details: Hold | null;
}

export const NO_HOLDS: EngineHolds = { weight: null, done: null, weightCheck: null, details: null };

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

const carriesNumbers = (text: string): boolean => /\d/.test(normalizeSpokenNumbers(text.replace(PRONOUN_ONE, ' ')));

const isFresh = <T extends Hold>(hold: T | null, state: EngineState): hold is T =>
  !!hold && hold.exerciseIndex === state.currentExerciseIndex && state.now - hold.at < HOLD_MS;

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
  known: { lastLogged: number | null; stated: number | null; planned: number | null };
  bodyweight: boolean;
  timed: boolean;
}

const contextOf = (state: EngineState): Context | null => {
  const exercise = state.exercises[state.currentExerciseIndex];
  if (!exercise) return null;
  const setsHere = state.loggedSets[state.currentExerciseIndex] ?? [];
  const lastLogged =
    [...setsHere].reverse().find((set) => set.weight !== null && set.unit !== 'seconds')?.weight ?? null;
  return {
    state,
    exercise,
    index: state.currentExerciseIndex,
    setsHere,
    setNumber: setsHere.length + 1,
    known: {
      lastLogged,
      stated: state.statedWeight?.exerciseIndex === state.currentExerciseIndex ? state.statedWeight.weight : null,
      planned: plannedWeightKg(exercise.loadScheme),
    },
    bodyweight: isBodyweightWork(exercise.name, exercise.loadScheme),
    timed: isTimedExercise(exercise.name),
  };
};

export const knownWeightFor = (state: EngineState): number | null => {
  const ctx = contextOf(state);
  return ctx ? ctx.known.lastLogged ?? ctx.known.stated ?? ctx.known.planned : null;
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
    if (source === 'voice') return { handled: true, effects, holds: next };
    const text =
      previous === 0
        ? `Got ${set.reps} reps. What weight was that? Nothing logged yet.`
        : `I still need the weight for those ${set.reps} reps before I can log ${setLabel(ctx)}. Type just the ` +
          `weight, like "${state.units === 'imperial' ? '25 lb' : '10 kg'}", or "bodyweight".`;
    return { handled: true, effects: [...effects, { type: 'announce', text }], holds: next };
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
  const { units } = state;
  const typed = source !== 'voice';
  let holds: EngineHolds = { ...inHolds };

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
          ? [{ type: 'undo' }]
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

  if (state.resting && looksLikeStartSetCommand(text)) {
    return { handled: true, effects: [{ type: 'start_next_set' }], holds: { ...holds, done: null } };
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
      ],
      holds: { ...holds, weight: null, weightCheck: null, done: null },
    };
  }
  if (last && correction?.kind === 'unclear' && typed) {
    const exerciseName = state.exercises[last.exerciseIndex]?.name ?? 'that exercise';
    return {
      handled: true,
      effects: [
        {
          type: 'announce',
          text:
            `What should ${exerciseName} set ${last.setIndex + 1} be? It's saved as ` +
            `${describeSetForUser(last.set, units)}. Type it like "${units === 'imperial' ? '40 lb' : '20 kg'}, 8 reps".`,
        },
      ],
      holds,
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

  if (isRestatement(latestSetTime(state.loggedSets), state.now, state.restFinishedAt)) {
    if (!typed) return { handled: true, effects: [], holds: { ...holds, details: null } };
    const lastAt = latestSetTime(state.loggedSets) ?? state.now;
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
              `Type the weight for those ${holds.weight.reps} reps, like "${state.units === 'imperial' ? '25 lb' : '10 kg'}", ` +
              `or "bodyweight", then tap Confirm set.`,
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
  const weight = ctx.timed ? null : ctx.known.lastLogged ?? ctx.known.stated ?? ctx.known.planned;
  return (
    `Set ${ctx.setNumber} of ${ctx.exercise.sets} on ${ctx.exercise.name}: ${describeRepScheme(ctx.exercise.repScheme)}` +
    `${weight != null ? ` at ${kgToDisplayWeight(weight, state.units)}` : ''}.`
  );
};
