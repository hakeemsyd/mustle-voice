import {
  classifySpokenSet,
  confirmsSetDone,
  COACH_ASKS_FOR_SET_DETAILS,
  COACH_ASKS_FOR_SET_DETAILS_BEFORE_V3,
  isAffirmation,
  isImplausibleWeightJump,
  isNegation,
  isRestatement,
  looksLikeStartSetCommand,
  needsWeightBeforeLogging,
  parseLoadSchemeKg,
  parseSetReport,
  parseWeightReply,
  type ParsedSet,
  type SetReportUnits,
} from './set-report.ts';
import { isBodyweightExercise, isTimedExercise } from './exercise-catalog.ts';
import { kgToLb } from './weight-units.ts';
import type { LiveSessionSnapshot } from './live-session-format.ts';

export const AWAITING_SET_DETAILS_MS = 120_000;

export type TurnSetOutcomeKind =
  | 'logged'
  | 'not_logged'
  | 'stated_weight'
  | 'needs_details'
  | 'needs_weight'
  | 'weight_check'
  | 'rest_ended'
  | 'repeat'
  | 'needs_confirmation';

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
  appliesRestatementRule?: boolean;
  confirmsBareReps?: boolean;
  typed?: boolean;
  now?: number;
}

export const WEIGHT_CONFIRM_MS = 120_000;

export const TURN_NOTE_HEADER = 'What the app did with THIS message (decided by the app itself, exact):';

const formatWeight = (kg: number, units: SetReportUnits): string =>
  units === 'imperial' ? `${kgToLb(kg)} lb` : `${kg} kg`;

const describeSet = (set: ParsedSet, units: SetReportUnits): string => {
  if (set.unit === 'seconds') {
    return set.reps >= 60 && set.reps % 60 === 0 ? `${set.reps / 60} min` : `${set.reps}s held`;
  }
  return set.weight != null ? `${set.reps} reps at ${formatWeight(set.weight, units)}` : `${set.reps} reps`;
};

const NOT_LOGGED_RULE =
  'Do not say a set is done, logged or recorded, do not praise a set as finished, and do not say rest ' +
  'is starting or running. You cannot log sets yourself; only the app does. Never say the app "should" ' +
  'or "will" log it, and never ask them what their screen shows: the live session state block above is ' +
  'exactly what their screen shows.';

const ASK_FOR_REPS =
  'If they are telling you they finished a set, the app could not read the rep count from it: ask exactly ' +
  '"How many reps did you get?" (and for the weight only if none is on record for this exercise). The app ' +
  'logs their answer itself.';

type CurrentExercise = NonNullable<LiveSessionSnapshot['currentExercise']>;

const lastLoggedWeightOf = (current: CurrentExercise): number | null =>
  [...current.loggedSets].reverse().find((s) => s.weight != null && s.unit !== 'seconds')?.weight ?? null;

const isBodyweightWorkOf = (current: CurrentExercise): boolean =>
  String(current.loadScheme ?? '').trim().toLowerCase() === 'bodyweight' || isBodyweightExercise(current.name);

export const isLiveStrengthSession = (snapshot: LiveSessionSnapshot | null): boolean => {
  return (
    !!snapshot &&
    snapshot.target.type === 'strength' &&
    snapshot.status !== 'finished' &&
    !!snapshot.currentExercise
  );
};

const CUE_HEADER = 'Exact set facts for THIS cue, from the app (use these numbers and no others):';

const REST_OVER_CUES = new Set(['rest_over', 'rest_final_countdown', 'silence_after_rest', 'silence_after_rest_final']);

export const describeCueFacts = (
  cue: string | null,
  snapshot: LiveSessionSnapshot | null,
  units: SetReportUnits,
): string | null => {
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
};

export const describeResumedStart = (snapshot: LiveSessionSnapshot | null, units: SetReportUnits): string | null => {
  if (!isLiveStrengthSession(snapshot)) return null;
  const current = snapshot!.currentExercise!;
  const doneHere = current.loggedSets.length;
  if (doneHere === 0) return null;
  const lastWeight = [...current.loggedSets].reverse().find((s) => s.weight != null && s.unit !== 'seconds')?.weight;
  const next = doneHere + 1;
  return (
    `${TURN_NOTE_HEADER}\n- This is a RESUMED workout, not a fresh one. ${doneHere} set${doneHere === 1 ? ' is' : 's are'} ` +
    `already logged on ${current.name}, so the next set is set ${next} of ${current.totalSets}. Say they are ` +
    `picking up where they left off and name exactly that set: "${current.name}, set ${next} of ` +
    `${current.totalSets}, ${current.repScheme}${lastWeight != null ? ` at ${formatWeight(lastWeight, units)}` : ''}". ` +
    `Never call it set 1 and never use any other set number.`
  );
};

export const describeUnconfirmedLog = (): string =>
  `${TURN_NOTE_HEADER}\n- The app was asked to log this set but has NOT confirmed it landed yet, so it is not ` +
  `counted. Tell them you are getting it logged and that it will show on the card in a moment. ${NOT_LOGGED_RULE}`;

export const describeTypedTurnSetOutcome = (restActive = false): string => {
  const rest = restActive
    ? ' Their rest timer is still running on screen. If they are asking to start the next set, call ' +
      'adjust_rest_timer with action "skip": the timer only ends when that tool runs, and saying they ' +
      'are on the next set does not end it.'
    : '';
  return (
    `${TURN_NOTE_HEADER}\n- NOTHING was logged from this message. Typed set reports are logged by the app ` +
    `before they ever reach you, so anything that reaches you was not. The "Sets COMPLETED" count ` +
    `above is exact. ${ASK_FOR_REPS}${rest} ${NOT_LOGGED_RULE}`
  );
};

const logged = (set: ParsedSet, snapshot: LiveSessionSnapshot, units: SetReportUnits): TurnSetOutcome => {
  const current = snapshot.currentExercise!;
  const setNumber = current.loggedSets.length + 1;
  const finishesExercise = setNumber >= current.totalSets;
  const next = snapshot.upcomingExercises[0] ?? null;
  const after = !finishesExercise
    ? 'The rest timer has started on screen. Confirm this set in one short line and say rest has started. Do not ' +
      'name or announce the next set yet; the app prompts you for it when rest ends.'
    : next
      ? `That was the last set of ${current.name}, so the app has already moved on to ${next}. There ` +
        'is no rest timer between exercises. Name the new exercise and its real target.'
      : 'That was the last set of the workout, so the workout is complete. Wrap it up.';
  return {
    kind: 'logged',
    set,
    note:
      `${TURN_NOTE_HEADER}\n- The app LOGGED this message as set ${setNumber} of ${current.totalSets} on ` +
      `${current.name}: ${describeSet(set, units)}. It is already recorded. The "Sets COMPLETED" ` +
      `count above was written before this message, so it does not include this set yet; count it ` +
      `as done. ${after} Do not ask them to confirm it. Only state a weight if one is given in this note.`,
  };
};

export const resolveTurnSetOutcome = (input: TurnSetOutcomeInput): TurnSetOutcome | null => {
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
          `${TURN_NOTE_HEADER}\n- NOTHING was logged yet. They gave ${set.reps} reps but no weight, and no weight is ` +
          `known yet for ${current.name}, so the app is holding the set and asking them on screen what ` +
          `weight they used. Ask them once, briefly, what weight that was, and never assume the plan's ` +
          `weight for them. When they answer, the app logs it itself. ${NOT_LOGGED_RULE}`,
      };
    }
    const weight = weightGiven ? set.weight : set.weight ?? (set.unit === 'seconds' ? null : knownWeight);
    const reference = lastLogged ?? parseLoadSchemeKg(current.loadScheme);
    if (isImplausibleWeightJump(weight, reference)) {
      return {
        kind: 'weight_check',
        set: { ...set, weight },
        note:
          `${TURN_NOTE_HEADER}\n- NOTHING was logged. The app heard ${formatWeight(weight!, units)} for this set, ` +
          `but the working weight here is ${formatWeight(reference!, units)}, so it is holding the set ` +
          `and asking them on screen whether that was right. Ask them once, briefly, to confirm the ` +
          `weight. The app logs it itself when they answer. ${NOT_LOGGED_RULE}`,
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
        confirmsBareReps: input.confirmsBareReps,
        typed: input.typed,
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
        `${TURN_NOTE_HEADER}\n- They said the weight the app heard was wrong, so NOTHING was logged and set ` +
        `${setNumber} of ${current.totalSets} is still open. Ask them once, briefly, for the real ` +
        `weight and reps. ${NOT_LOGGED_RULE}`,
    };
  }

  const heldForDone = earlier[0]?.kind === 'needs_confirmation' ? earlier[0] : null;
  if (heldForDone?.set && confirmsSetDone(userText) && !parseSetReport(userText, units)) {
    return settle(heldForDone.set, false);
  }
  if (heldForDone && isNegation(userText)) {
    return {
      kind: 'not_logged',
      note:
        `${TURN_NOTE_HEADER}\n- They said that set is NOT done, so the app dropped the reps it was holding and ` +
        `nothing was logged. Set ${setNumber} of ${current.totalSets} is still open. One short line, then let ` +
        `them lift. ${NOT_LOGGED_RULE}`,
    };
  }

  if (snapshot!.status === 'resting' && looksLikeStartSetCommand(userText)) {
    return {
      kind: 'rest_ended',
      note:
        `${TURN_NOTE_HEADER}\n- They asked to start, so the app ended their rest early and the timer is gone. ` +
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
    typed: input.typed,
    confirmsBareReps: input.confirmsBareReps,
    resting: snapshot!.status === 'resting',
  });

  const reportsASet = intent.kind === 'log' || intent.kind === 'unconfirmed';
  if (reportsASet && input.appliesRestatementRule && !input.typed && isRestatement(snapshot!.lastSetLoggedAt, now, snapshot!.restFinishedAt)) {
    return {
      kind: 'repeat',
      note:
        `${TURN_NOTE_HEADER}\n- This came in seconds after the app logged a set, which is too soon to have done ` +
        `another one, so the app treated it as them repeating that set and did NOT count it again. Nothing new ` +
        `was logged and the "Sets COMPLETED" count above is exact${snapshot!.status === 'resting' ? '; rest is still running' : ''}. ` +
        `Acknowledge it in a few words ("got it, that one's in") and nothing more: do not ask about the next set, ` +
        `its weight or its reps, and do not treat this as another set. If they say it really was a separate set, ` +
        `tell them to repeat it in a moment.`,
    };
  }

  if (intent.kind === 'log') return settle(intent.set, false);

  if (intent.kind === 'unconfirmed') {
    return {
      kind: 'needs_confirmation',
      set: intent.set,
      note:
        `${TURN_NOTE_HEADER}\n- They said ${describeSet(intent.set, units)} while their rest timer is running, which ` +
        `could be the set they just finished or the plan for the next one, so the app is holding it and has NOT ` +
        `counted another set. Ask exactly "Is that another set done?" and nothing else. If they say yes, the app ` +
        `logs it itself; anything else and nothing is counted. ${NOT_LOGGED_RULE}`,
    };
  }

  if (intent.kind === 'stated_weight') {
    return {
      kind: 'stated_weight',
      note:
        `${TURN_NOTE_HEADER}\n- The app noted ${formatWeight(intent.weight, units)} as their working weight for ` +
        `${current.name}. NOTHING was logged; the "Sets COMPLETED" count above is exact and set ` +
        `${setNumber} has not happened yet. ${NOT_LOGGED_RULE}`,
    };
  }

  if (intent.kind === 'needs_details') {
    return {
      kind: 'needs_details',
      note:
        `${TURN_NOTE_HEADER}\n- They said a set is finished but gave no rep count the app could read, so ` +
        `NOTHING was logged and set ${setNumber} of ${current.totalSets} is still open. Ask exactly "How many ` +
        `reps did you get?" and nothing else; the app logs their answer itself. ${NOT_LOGGED_RULE}`,
    };
  }

  return {
    kind: 'not_logged',
    note:
      `${TURN_NOTE_HEADER}\n- NOTHING was logged from this message. The "Sets COMPLETED" count above is exact. ` +
      `${
        classifySpokenSet(userText, units, { awaitingDetails: false, confirmsBareReps: true, resting: true }).kind ===
        'unconfirmed'
          ? 'They gave a rep count but not whether the set is finished, so the app did not log it. Ask exactly ' +
            '"Is that set done? How many was that?" and the app logs their answer.'
          : ASK_FOR_REPS
      } If they are describing what they are about to do, or telling you a set has NOT happened yet, that is ` +
      `not a finished set. ${NOT_LOGGED_RULE}`,
  };
};
