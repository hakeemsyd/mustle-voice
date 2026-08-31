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
        ? c.loggedSets.map((s) => `${s.weight != null ? `${s.weight}kg` : 'bodyweight'}×${s.reps}`).join(', ')
        : 'none yet';
    lines.push(
      `- Current exercise: "${c.name}", set ${c.setIndex + 1} of ${c.totalSets} ` +
        `(target ${c.repScheme}${c.loadScheme ? `, ${c.loadScheme}` : ''}). Sets logged this exercise: ${loggedDesc}.`,
    );
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
      'tool call actually succeeds.',
  );

  return lines.join('\n');
}
