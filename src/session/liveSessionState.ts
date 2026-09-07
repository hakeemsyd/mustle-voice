import type { LoggedSet, SessionExercise, SessionTarget } from './ActiveSessionContext';

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
  } | null;
  upcomingExercises: string[];
  restTargetSec: number | null;
  restRemainingSec: number | null;
}

interface SnapshotInput {
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
}

export function buildLiveSessionSnapshot(input: SnapshotInput): LiveSessionSnapshot | null {
  // Previously returned null once `ended` was true, which meant the coach had no ground truth
  // at all for the post-workout wrap-up conversation — confirmed dead code, `status: 'finished'`
  // was declared but unreachable. Only the total absence of a session (never started, or fully
  // cleared) should suppress the snapshot now.
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
        }
      : null,
    upcomingExercises: input.exercises.slice(input.currentExerciseIndex + 1).map((e) => e.name),
    restTargetSec: input.resting ? input.restTargetSec : null,
    restRemainingSec,
  };
}

export function describeLiveSessionSnapshot(snapshot: LiveSessionSnapshot): string {
  if (snapshot.target.type === 'cardio') {
    return (
      `Live session state: cardio (${snapshot.target.activity}), ${snapshot.status}, ` +
      `${snapshot.elapsedSec}s elapsed. This is ground truth — never contradict it.`
    );
  }

  const lines: string[] = [`Live session state (ground truth — the screen the user is looking at right now):`];
  lines.push(`- Status: ${snapshot.status}${snapshot.focus ? `, focus "${snapshot.focus}"` : ''}.`);

  if (snapshot.currentExercise) {
    const c = snapshot.currentExercise;
    const loggedDesc =
      c.loggedSets.length > 0
        ? c.loggedSets
            .map((s) =>
              s.unit === 'seconds'
                ? `${s.reps}s held`
                : `${s.weight != null ? `${s.weight}kg` : 'bodyweight'}×${s.reps}`,
            )
            .join(', ')
        : 'none yet';
    const done = c.loggedSets.length;
    const remaining = Math.max(0, c.totalSets - done);
    // Spelled out as completed-vs-remaining rather than a bare "set N of M" ordinal. Confirmed
    // live: "set 4 of 4" (3 done, the 4th still to do) was read as "4 of 4 finished", and the
    // coach moved on to the next exercise while the app was still waiting on the last set.
    lines.push(
      `- Current exercise: "${c.name}" (target ${c.repScheme}${c.loadScheme ? `, ${c.loadScheme}` : ''}).`,
    );
    lines.push(
      remaining > 0
        ? `- Sets COMPLETED on it: ${done} of ${c.totalSets}. ${remaining} still to do — the next one ` +
            `to perform is set ${done + 1}, which has NOT happened yet. Do not move on to another ` +
            `exercise until all ${c.totalSets} are completed.`
        : `- Sets COMPLETED on it: ${done} of ${c.totalSets}. This exercise is finished.`,
    );
    lines.push(`- Loads logged so far on this exercise: ${loggedDesc}.`);
  } else {
    lines.push('- No current exercise (session not yet loaded or already finished).');
  }

  if (snapshot.status === 'resting' && snapshot.restRemainingSec !== null) {
    lines.push(`- Resting: ${snapshot.restRemainingSec}s remaining of a ${snapshot.restTargetSec}s target.`);
  }

  lines.push(
    snapshot.upcomingExercises.length > 0
      ? `- Upcoming exercises: ${snapshot.upcomingExercises.join(', ')}.`
      : '- No exercises left after this one.',
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
}
