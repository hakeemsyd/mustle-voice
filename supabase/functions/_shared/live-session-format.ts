import { humanizeFocus } from './humanize.ts';
import { describeRestRules } from './rest-length.ts';
import { convertLoadScheme } from './load-scheme.ts';
import { isTimedExercise } from './exercise-catalog.ts';
import { normalizeLoadScheme } from './load-intent.ts';
import { kgToLb } from './weight-units.ts';
import { describeSetProvenance, type ProvenancedSet } from './set-dispute.ts';
// Server-side port of src/session/liveSessionState.ts's buildLiveSessionSnapshot/
// describeLiveSessionSnapshot — kept in sync manually since Supabase Edge Functions only bundle
// supabase/functions/, the same reason resolveTodaySession/estimateRestSeconds are duplicated
// instead of imported. Any behavioral change to either copy should be mirrored in the other.

// Was 6 hours — meant the coach could keep treating an abandoned session (app closed mid-workout,
// never formally ended) as "in progress" for most of a day. Damion's explicit spec (2026-09-09):
// 60 minutes of inactivity for V1, then the session closes and gets marked interrupted for the
// coach to ask about — see interrupted-session.ts, which uses this same constant as its staleness
// threshold, not just a "stop treating it as live" cutoff.
export const LIVE_STATE_MAX_AGE_MS = 60 * 60 * 1000;

export type TurnMode = 'live' | 'default';

const RUNNING_STATUS = /- Status: (?:training|resting|paused)\b/;

export const resolveTurnMode = (liveBlock: string | null | undefined): TurnMode =>
  liveBlock && RUNNING_STATUS.test(liveBlock) ? 'live' : 'default';

export const NO_LIVE_SESSION_NOTE =
  'LIVE WORKOUT STATE\n' +
  '- NO workout is in progress right now. There is no current exercise, no set in play, and no rest ' +
  'timer running.\n' +
  '- Any sets, exercises, weights or rest talk earlier in this conversation belongs to a session ' +
  'that has already ended. Do not continue it, do not ask which exercise they are on, do not ' +
  'announce a set or a rest, and do not ask them to slow down.\n' +
  '- If they want to train, they start a workout from Home; until then, answer whatever they ' +
  'actually asked about.';

type LoggedSet = ProvenancedSet;

interface SessionExercise {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  repScheme: string;
  loadScheme: string | null;
}

type SessionTarget =
  | { type: 'strength'; planSessionId: string; switchedFromSessionId?: string }
  | { type: 'cardio'; activity: string; switchedFromSessionId?: string };

export interface LiveSessionSnapshot {
  target: SessionTarget;
  focus: string | null;
  status: 'training' | 'resting' | 'paused' | 'finished';
  elapsedSec: number;
  currentExercise: {
    name: string;
    setIndex: number;
    totalSets: number;
    repScheme: string;
    loadScheme: string | null;
    loggedSets: LoggedSet[];
    statedWeight?: number | null;
    statedWeightAt?: number | null;
  } | null;
  upcomingExercises: string[];
  earlierExercises?: { name: string; totalSets: number; loggedSets: LoggedSet[] }[];
  restTargetSec: number | null;
  restRemainingSec: number | null;
  restOverrideSec?: number | null;
  restLines?: string[];
  lastSetLoggedAt?: number | null;
  restFinishedAt?: number | null;
}

export interface SnapshotInput {
  target: SessionTarget | null;
  focus: string | null;
  exercises: SessionExercise[];
  currentExerciseIndex: number;
  loggedSets: LoggedSet[][];
  resting: boolean;
  restTargetSec: number;
  restEndAt: number | null;
  restPausedRemainingSec: number | null;
  ended: boolean;
  paused: boolean;
  elapsedSec: number;
  statedWeight?: { exerciseIndex: number; weight: number; at?: number } | null;
  restOverrideSec?: number | null;
  restByExercise?: Record<string, number> | null;
  savedRestByExercise?: Record<string, number> | null;
  restFinishedAt?: number | null;
}

const latestSetTime = (loggedSets: LoggedSet[][]): number | null => {
  const times = (loggedSets ?? []).flat().map((set) => set?.at).filter((at): at is number => typeof at === 'number');
  return times.length > 0 ? Math.max(...times) : null;
};

export const buildLiveSessionSnapshot = (input: SnapshotInput): LiveSessionSnapshot | null => {
  if (!input.target) return null;

  const current = input.exercises[input.currentExerciseIndex] ?? null;
  const restRemainingSec =
    input.restPausedRemainingSec !== null
      ? input.restPausedRemainingSec
      : input.restEndAt !== null
        ? Math.max(0, Math.round((input.restEndAt - Date.now()) / 1000))
        : null;

  return {
    target: input.target,
    focus: input.focus,
    status: input.ended ? 'finished' : input.paused ? 'paused' : input.resting ? 'resting' : 'training',
    elapsedSec: input.elapsedSec,
    currentExercise: current
      ? {
          name: current.name,
          setIndex: input.loggedSets[input.currentExerciseIndex]?.length ?? 0,
          totalSets: current.sets,
          repScheme: current.repScheme,
          loadScheme: current.loadScheme,
          loggedSets: input.loggedSets[input.currentExerciseIndex] ?? [],
          statedWeight:
            input.statedWeight?.exerciseIndex === input.currentExerciseIndex ? input.statedWeight.weight : null,
          statedWeightAt:
            input.statedWeight?.exerciseIndex === input.currentExerciseIndex ? input.statedWeight.at ?? null : null,
        }
      : null,
    earlierExercises: input.exercises
      .map((e, index) => ({ name: e.name, totalSets: e.sets, loggedSets: input.loggedSets[index] ?? [], index }))
      .filter((e) => e.index !== input.currentExerciseIndex && e.loggedSets.length > 0)
      .map(({ index: _index, ...e }) => e),
    upcomingExercises: input.exercises
      .slice(input.currentExerciseIndex + 1)
      .map((e) => `${e.name} (${e.sets} sets of ${e.repScheme}${e.loadScheme ? `, ${normalizeLoadScheme(e.loadScheme)}` : ''})`),
    restTargetSec: input.resting ? input.restTargetSec : null,
    restRemainingSec,
    restOverrideSec: typeof input.restOverrideSec === 'number' ? input.restOverrideSec : null,
    restLines: describeRestRules(input.exercises ?? [], input.currentExerciseIndex, {
      restByExercise: input.restByExercise,
      restOverrideSec: input.restOverrideSec,
      savedRestByExercise: input.savedRestByExercise,
    }),
    lastSetLoggedAt: latestSetTime([input.loggedSets?.[input.currentExerciseIndex] ?? []]),
    restFinishedAt: typeof input.restFinishedAt === 'number' ? input.restFinishedAt : null,
  };
};

const formatWeight = (kg: number, units: 'metric' | 'imperial'): string =>
  units === 'imperial' ? `${kgToLb(kg)} lb` : `${kg} kg`;

const formatDuration = (seconds: number): string =>
  seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s held`;

const describeSavedSet = (s: LoggedSet, units: 'metric' | 'imperial'): string =>
  s.unit === 'seconds' ? formatDuration(s.reps) : `${s.weight != null ? formatWeight(s.weight, units) : 'bodyweight'}×${s.reps}`;

export const describeEarlierExercises = (
  snapshot: LiveSessionSnapshot | null,
  units: 'metric' | 'imperial' = 'metric',
): string | null => {
  const earlier = snapshot?.earlierExercises ?? [];
  const record =
    earlier.length > 0
      ? `- Already done in this session, as saved (corrections included): ` +
        earlier
          .map((e) => `${e.name}, ${e.loggedSets.length} of ${e.totalSets} sets: ${e.loggedSets.map((s) => describeSavedSet(s, units)).join(', ')}`)
          .join('; ') +
        '.'
      : null;
  if (!snapshot?.currentExercise && !record) return null;
  return [
    record,
    "- The user's earlier messages in this workout (set reports, corrections, rest changes) were already handled by the " +
      'app, which answered each one itself; everything that came of them is in this block. Never work sets out of those ' +
      'messages, never quiz the user about them, and answer what they ask now. If a count they mention differs from this ' +
      'saved record, say what is saved in one line and carry on.',
  ]
    .filter(Boolean)
    .join('\n');
};

export const describeLiveSessionSnapshot = (
  snapshot: LiveSessionSnapshot,
  units: 'metric' | 'imperial' = 'metric',
): string => {
  if (snapshot.target.type === 'cardio') {
    return (
      `Live session state: cardio (${snapshot.target.activity}), ${snapshot.status}, ` +
      `${snapshot.elapsedSec}s elapsed. This is ground truth — never contradict it.`
    );
  }

  const lines: string[] = [`Live session state (ground truth — the screen the user is looking at right now):`];
  lines.push(
    `- Status: ${snapshot.status}${snapshot.focus ? `, focus "${humanizeFocus(snapshot.focus)}"` : ''}.`,
  );

  if (snapshot.currentExercise) {
    const c = snapshot.currentExercise;
    const provenance = describeSetProvenance(c.loggedSets, (s) =>
      s.unit === 'seconds'
        ? formatDuration(s.reps)
        : `${s.weight != null ? formatWeight(s.weight, units) : 'bodyweight'}×${s.reps}`,
    );
    const loggedDesc = c.loggedSets.length > 0 ? provenance.list : 'none yet';
    const done = c.loggedSets.length;
    const remaining = Math.max(0, c.totalSets - done);
    // Spelled out as completed-vs-remaining rather than a bare "set N of M" ordinal. Confirmed
    // live: "set 4 of 4" (3 done, the 4th still to do) was read as "4 of 4 finished", and the
    // coach moved on to the next exercise while the app was still waiting on the last set.
    // The rep target is spelled out as the only acceptable source rather than just stated, because
    // stating it was not enough: confirmed live, minutes after being handed "Romanian Deadlift,
    // target 8-10", the coach announced "Romanian Deadlift, six to eight reps" — carrying over the
    // previous exercise's range after five turns of repeating it. A number said many times in the
    // conversation beats a number listed once, unless the listing is explicit that it wins.
    const lastLoggedKg = [...c.loggedSets].reverse().find((s) => s.weight != null && s.unit !== 'seconds')?.weight ?? null;
    const currentLoad =
      lastLoggedKg != null
        ? `${formatWeight(lastLoggedKg, units)} (the weight on their last set, which is what the card shows)`
        : c.loadScheme
          ? convertLoadScheme(c.loadScheme, units)
          : null;
    const targetLabel = isTimedExercise(c.name) ? 'target time' : 'target reps';
    lines.push(
      `- Current exercise: "${c.name}" — ${targetLabel} ${c.repScheme}` +
        `${currentLoad ? `, load ${currentLoad}` : ''}. When you say the target out loud, say ` +
        `EXACTLY ${c.repScheme} — never a rep range carried over from an earlier exercise in this ` +
        `session, however many times you just said it.`,
    );
    lines.push(
      remaining > 0
        ? `- Sets COMPLETED on it: ${done} of ${c.totalSets}. ${remaining} still to do — the next one ` +
            `to perform is set ${done + 1}, which has NOT happened yet. Do not move on to another ` +
            `exercise until all ${c.totalSets} are completed. Announcing a set, or telling them to go, ` +
            `does NOT complete it, and never count one twice because it was discussed more than once ` +
            `— confirmed live, the coach treated its own "set three, go" as set three being finished ` +
            `and challenged the user's real report of it as a duplicate. ` +
            `This count is exact. The only exception is when the "What the app did with THIS message" ` +
            `note says the app LOGGED this message, in which case count that one set as done. Never ` +
            `assume a set was logged from what was said, and never accuse them of repeating one.`
        : `- Sets COMPLETED on it: ${done} of ${c.totalSets}. This exercise is finished.`,
    );
    lines.push(
      `- Counting reps out loud together, even all the way to or past the target, is NOT a ` +
        `completed set and never changes the number above — confirmed live: after counting to ten ` +
        `together with the user, the coach announced "that's ten reps, solid first set" and "rest ` +
        `is starting now," neither of which had happened, then argued with the user before backing ` +
        `down. The COMPLETED count above is the only thing that says a set happened; if it hasn't ` +
        `moved, nothing was logged, whatever was just said out loud. Never announce a set as done, ` +
        `never say rest is starting, and never invent a reason a rep total went over target, unless ` +
        `this exact block already shows it. If the user tells you it was just counting, agree ` +
        `immediately on the first correction — don't defend a claim this block already disproves.`,
    );
    lines.push(`- Loads logged so far on this exercise: ${loggedDesc}.`);
    if (provenance.warning) lines.push(provenance.warning);
    const earlier = describeEarlierExercises(snapshot, units);
    if (earlier) lines.push(earlier);
  } else {
    lines.push('- No current exercise (session not yet loaded or already finished).');
  }

  if (snapshot.restLines) {
    lines.push(...snapshot.restLines);
  } else if (snapshot.restOverrideSec) {
    lines.push(`- They asked for ${snapshot.restOverrideSec}s rests: every rest from here on is ${snapshot.restOverrideSec}s.`);
  }

  if (snapshot.status === 'resting' && snapshot.restRemainingSec !== null) {
    lines.push(
      `- Resting: ${snapshot.restRemainingSec}s remaining of a ${snapshot.restTargetSec}s target. ` +
        `This figure was read at the instant this block was written and is already out of date by ` +
        `the time you speak. You have no clock: you cannot count down, you cannot work out how ` +
        `much is left now, and you cannot tell how long your own reply took to reach them. So ` +
        `never say a number of seconds remaining out loud — not this one, not one derived from it. ` +
        `Say "almost there" or "nearly up", never "ten seconds". The app owns the timer, it is on ` +
        `screen in front of them, and it is the only thing that announces when rest is over. Never ` +
        `claim you are timing anything yourself and never ask them to read the timer to you.`,
    );
  }

  lines.push(
    snapshot.upcomingExercises.length > 0
      ? `- Upcoming exercises: ${snapshot.upcomingExercises.join(', ')}.`
      : '- No exercises left after this one.',
  );

  lines.push(
    'Count sets ONLY from this block. Announcing a set is not the same as the user performing it, ' +
    'and neither is acknowledging one you misheard — your own earlier turns are not a record of ' +
    'what happened, this block is. If it disagrees with something you said a minute ago, this ' +
    'block is right and you were wrong. The one exception: if the user says the app counted a set ' +
    'they did not do, believe them over this block and call undo_last_set.',
  );

  lines.push(
    'This is what the screen actually shows right now — never claim a different exercise, set, or ' +
      'timer value than what is listed here, and never claim you changed it unless the corresponding ' +
      'tool call actually succeeds. The target reps/load and the logged sets above are the ONLY ' +
      'numbers you may state for this exercise — never state a different rep range, set count, or a ' +
      'specific weight that is not one of the values actually logged above (confirmed live: the app ' +
      'is programmed for one scheme and load was invented as something else entirely). If "Sets ' +
      'logged this exercise" says none yet and the user asks what weight to use, say you don\'t have ' +
      'one on record and ask — never invent a number to sound helpful.',
  );

  return lines.join('\n');
};
