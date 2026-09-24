import {
  classifySpokenSet,
  COACH_ASKS_FOR_SET_DETAILS,
  COACH_ASKS_FOR_SET_DETAILS_BEFORE_V3,
  isAffirmation,
  isImplausibleWeightJump,
  isNegation,
  looksLikeStartSetCommand,
  needsWeightBeforeLogging,
  parseLoadSchemeKg,
  parseWeightReply,
  type ParsedSet,
  type SetReportUnits,
} from './set-report.ts';
import { isBodyweightExercise, isTimedExercise } from './exercise-catalog.ts';
import type { LiveSessionSnapshot } from './live-session-format.ts';

export const AWAITING_SET_DETAILS_MS = 120_000;

export type TurnSetOutcomeKind =
  | 'logged'
  | 'not_logged'
  | 'stated_weight'
  | 'needs_details'
  | 'needs_weight'
  | 'weight_check'
  | 'rest_ended';

export interface TurnSetOutcome {
  kind: TurnSetOutcomeKind;
  set?: ParsedSet;
  note: string;
}

export interface TurnSetOutcomeInput {
  userText: string;
  snapshot: LiveSessionSnapshot | null;
  units: SetReportUnits;
  lastCoachMessage?: { content: string; at: string | null } | null;
  recentUserMessages?: { content: string; at: string | null }[];
  legacyClient?: boolean;
  holdsMissingWeight?: boolean;
  now?: number;
}

export const WEIGHT_CONFIRM_MS = 120_000;

const HEADER = 'What the app did with THIS message (decided by the app itself, exact):';

const formatWeight = (kg: number, units: SetReportUnits): string =>
  units === 'imperial' ? `${Math.round(kg * 2.20462 * 10) / 10} lb` : `${kg} kg`;

const describeSet = (set: ParsedSet, units: SetReportUnits): string => {
  if (set.unit === 'seconds') {
    return set.reps >= 60 && set.reps % 60 === 0 ? `${set.reps / 60} min` : `${set.reps}s held`;
  }
  return set.weight != null ? `${set.reps} reps at ${formatWeight(set.weight, units)}` : `${set.reps} reps`;
};

const NOT_LOGGED_RULE =
  'Unless log_live_set returns status "logged" in this turn, do not say a set is done, logged or ' +
  'recorded, do not praise a set as finished, and do not say rest is starting or running. Never ' +
  'say the app "should" log it or ask them what their screen shows: the live session state block ' +
  'above is exactly what their screen shows.';

type CurrentExercise = NonNullable<LiveSessionSnapshot['currentExercise']>;

const lastLoggedWeightOf = (current: CurrentExercise): number | null =>
  [...current.loggedSets].reverse().find((s) => s.weight != null && s.unit !== 'seconds')?.weight ?? null;

const isBodyweightWorkOf = (current: CurrentExercise): boolean =>
  String(current.loadScheme ?? '').trim().toLowerCase() === 'bodyweight' || isBodyweightExercise(current.name);

export type ToolSetWeight = { weight: number | null } | { needsWeightFor: string };

export function resolveToolSetWeight(
  snapshot: LiveSessionSnapshot | null,
  weightKg: number | null,
  timed: boolean,
): ToolSetWeight {
  if (timed) return { weight: null };
  if (weightKg != null) return { weight: weightKg };
  const current = snapshot?.currentExercise;
  if (!current) return { weight: null };
  const known = lastLoggedWeightOf(current) ?? current.statedWeight ?? null;
  if (known != null) return { weight: known };
  return isBodyweightWorkOf(current) ? { weight: null } : { needsWeightFor: current.name };
}

export function isLiveStrengthSession(snapshot: LiveSessionSnapshot | null): boolean {
  return (
    !!snapshot &&
    snapshot.target.type === 'strength' &&
    snapshot.status !== 'finished' &&
    !!snapshot.currentExercise
  );
}

const CUE_HEADER = 'Exact set facts for THIS cue, from the app (use these numbers and no others):';

const REST_OVER_CUES = new Set(['rest_over', 'rest_final_countdown', 'silence_after_rest', 'silence_after_rest_final']);

export function describeCueFacts(
  cue: string | null,
  snapshot: LiveSessionSnapshot | null,
  units: SetReportUnits,
): string | null {
  if (!cue || !isLiveStrengthSession(snapshot)) return null;
  const current = snapshot!.currentExercise!;
  const done = current.loggedSets.length;
  const total = current.totalSets;
  if (cue === 'set_logged') {
    const last = current.loggedSets[done - 1];
    if (!last) return null;
    return (
      `${CUE_HEADER}\n- The set just logged was set ${done} of ${total} on ${current.name}: ` +
      `${describeSet(last, units)}. ${done} done, ${Math.max(0, total - done)} to go, and the next one ` +
      `will be set ${done + 1}. If you name the set that just finished, it is set ${done}, never set ` +
      `${done + 1}.`
    );
  }
  if (REST_OVER_CUES.has(cue)) {
    return (
      `${CUE_HEADER}\n- ${done} of ${total} sets are done on ${current.name}. The set coming up is set ` +
      `${done + 1} of ${total}, target ${current.repScheme}. If you name it, call it set ${done + 1}.`
    );
  }
  if (cue === 'exercise_advanced') {
    return (
      `${CUE_HEADER}\n- The current exercise is now ${current.name}, and nothing is logged on it yet: ` +
      `set 1 of ${total}, target ${current.repScheme}.`
    );
  }
  return null;
}

export function describeResumedStart(snapshot: LiveSessionSnapshot | null, units: SetReportUnits): string | null {
  if (!isLiveStrengthSession(snapshot)) return null;
  const current = snapshot!.currentExercise!;
  const doneHere = current.loggedSets.length;
  if (doneHere === 0) return null;
  const lastWeight = [...current.loggedSets].reverse().find((s) => s.weight != null && s.unit !== 'seconds')?.weight;
  const next = doneHere + 1;
  return (
    `${HEADER}\n- This is a RESUMED workout, not a fresh one. ${doneHere} set${doneHere === 1 ? ' is' : 's are'} ` +
    `already logged on ${current.name}, so the next set is set ${next} of ${current.totalSets}. Say they are ` +
    `picking up where they left off and name exactly that set: "${current.name}, set ${next} of ` +
    `${current.totalSets}, ${current.repScheme}${lastWeight != null ? ` at ${formatWeight(lastWeight, units)}` : ''}". ` +
    `Never call it set 1 and never use any other set number.`
  );
}

export function describeTypedTurnSetOutcome(restActive = false): string {
  const rest = restActive
    ? ' Their rest timer is still running on screen. If they are asking to start the next set, call ' +
      'adjust_rest_timer with action "skip": the timer only ends when that tool runs, and saying they ' +
      'are on the next set does not end it.'
    : '';
  return (
    `${HEADER}\n- NOTHING was logged from this message. Typed set reports are logged by the app ` +
    `before they ever reach you, so anything that reaches you was not. The "Sets COMPLETED" count ` +
    `above is exact. If they are telling you they finished a set, call log_live_set with the reps ` +
    `they gave, or ask for the rep count in one short question if they gave none.${rest} ${NOT_LOGGED_RULE}`
  );
}

function logged(set: ParsedSet, snapshot: LiveSessionSnapshot, units: SetReportUnits): TurnSetOutcome {
  const current = snapshot.currentExercise!;
  const setNumber = current.loggedSets.length + 1;
  const finishesExercise = setNumber >= current.totalSets;
  const next = snapshot.upcomingExercises[0] ?? null;
  const after = !finishesExercise
    ? 'The rest timer has started on screen. Confirm the set in one short line and say rest has started.'
    : next
      ? `That was the last set of ${current.name}, so the app has already moved on to ${next}. There ` +
        'is no rest timer between exercises. Name the new exercise and its real target.'
      : 'That was the last set of the workout, so the workout is complete. Wrap it up.';
  return {
    kind: 'logged',
    set,
    note:
      `${HEADER}\n- The app LOGGED this message as set ${setNumber} of ${current.totalSets} on ` +
      `${current.name}: ${describeSet(set, units)}. It is already recorded. The "Sets COMPLETED" ` +
      `count above was written before this message, so it does not include this set yet; count it ` +
      `as done. ${after} Do not call log_live_set for it and do not ask them to confirm it. Only ` +
      `state a weight if one is given in this note.`,
  };
}

export function resolveTurnSetOutcome(input: TurnSetOutcomeInput): TurnSetOutcome | null {
  const { userText, snapshot, units } = input;
  if (!isLiveStrengthSession(snapshot)) return null;
  const now = input.now ?? Date.now();
  const current = snapshot!.currentExercise!;
  const done = current.loggedSets.length;
  const setNumber = done + 1;

  const lastLogged = lastLoggedWeightOf(current);
  const knownWeight = lastLogged ?? current.statedWeight ?? null;
  const bodyweightWork = isBodyweightWorkOf(current);

  const settle = (set: ParsedSet, weightGiven: boolean): TurnSetOutcome => {
    if (!weightGiven && input.holdsMissingWeight && needsWeightBeforeLogging(set, knownWeight, bodyweightWork)) {
      return {
        kind: 'needs_weight',
        set,
        note:
          `${HEADER}\n- NOTHING was logged yet. They gave ${set.reps} reps but no weight, and no weight is ` +
          `known yet for ${current.name}, so the app is holding the set and asking them on screen what ` +
          `weight they used. Ask them once, briefly, what weight that was. When they answer, the app logs ` +
          `it. ${NOT_LOGGED_RULE}`,
      };
    }
    const weight = weightGiven ? set.weight : set.weight ?? (set.unit === 'seconds' ? null : knownWeight);
    const reference = lastLogged ?? parseLoadSchemeKg(current.loadScheme);
    if (isImplausibleWeightJump(weight, reference)) {
      return {
        kind: 'weight_check',
        set: { ...set, weight },
        note:
          `${HEADER}\n- NOTHING was logged. The app heard ${formatWeight(weight!, units)} for this set, ` +
          `but the working weight here is ${formatWeight(reference!, units)}, so it is holding the set ` +
          `and asking them on screen whether that was right. Ask them once, briefly, to confirm the ` +
          `weight. ${NOT_LOGGED_RULE}`,
      };
    }
    return logged({ ...set, weight }, snapshot!, units);
  };

  const earlier = (input.recentUserMessages ?? [])
    .filter((m) => !m.at || now - new Date(m.at).getTime() < WEIGHT_CONFIRM_MS)
    .map((m) =>
      resolveTurnSetOutcome({
        userText: m.content,
        snapshot,
        units,
        now,
        legacyClient: input.legacyClient,
        holdsMissingWeight: input.holdsMissingWeight,
      }),
    );
  const heldForWeight = earlier.find((o) => o?.kind === 'needs_weight');
  const weightReply = heldForWeight?.set ? parseWeightReply(userText, units) : null;
  if (heldForWeight?.set && weightReply) {
    return settle({ ...heldForWeight.set, weight: weightReply.weight }, true);
  }

  const heldForConfirmation = earlier.find((o) => o?.kind === 'weight_check');
  if (heldForConfirmation?.set && isAffirmation(userText)) {
    return logged(heldForConfirmation.set, snapshot!, units);
  }
  if (heldForConfirmation && isNegation(userText)) {
    return {
      kind: 'needs_details',
      note:
        `${HEADER}\n- They said the weight the app heard was wrong, so NOTHING was logged and set ` +
        `${setNumber} of ${current.totalSets} is still open. Ask them once, briefly, for the real ` +
        `weight and reps. ${NOT_LOGGED_RULE}`,
    };
  }

  if (snapshot!.status === 'resting' && looksLikeStartSetCommand(userText)) {
    return {
      kind: 'rest_ended',
      note:
        `${HEADER}\n- They asked to start, so the app ended their rest early and the timer is gone. ` +
        `Nothing was logged. Give the real next-set prompt: set ${setNumber} of ${current.totalSets} on ` +
        `${current.name}, target ${current.repScheme}. One short line, then let them lift.`,
    };
  }

  const coach = input.lastCoachMessage;
  const awaitingDetails =
    !!coach &&
    (input.holdsMissingWeight ? COACH_ASKS_FOR_SET_DETAILS : COACH_ASKS_FOR_SET_DETAILS_BEFORE_V3).test(
      coach.content ?? '',
    ) &&
    (!coach.at || now - new Date(coach.at).getTime() < AWAITING_SET_DETAILS_MS);

  const intent = classifySpokenSet(userText, units, {
    awaitingDetails,
    timedExercise: isTimedExercise(current.name),
    legacy: input.legacyClient,
  });

  if (intent.kind === 'log') return settle(intent.set, false);

  if (intent.kind === 'stated_weight') {
    return {
      kind: 'stated_weight',
      note:
        `${HEADER}\n- The app noted ${formatWeight(intent.weight, units)} as their working weight for ` +
        `${current.name}. NOTHING was logged; the "Sets COMPLETED" count above is exact and set ` +
        `${setNumber} has not happened yet. ${NOT_LOGGED_RULE}`,
    };
  }

  if (intent.kind === 'needs_details') {
    return {
      kind: 'needs_details',
      note:
        `${HEADER}\n- They said a set is finished but gave no rep count the app could read, so ` +
        `NOTHING was logged and set ${setNumber} of ${current.totalSets} is still open. Ask them once, ` +
        `briefly, how many reps they got. ${NOT_LOGGED_RULE}`,
    };
  }

  return {
    kind: 'not_logged',
    note:
      `${HEADER}\n- NOTHING was logged from this message. The "Sets COMPLETED" count above is exact. ` +
      `If they are telling you they finished a set, call log_live_set with the reps they said, or ask ` +
      `for the rep count in one short question if they gave none. If they are describing what they ` +
      `are about to do, that is not a finished set. ${NOT_LOGGED_RULE}`,
  };
}
