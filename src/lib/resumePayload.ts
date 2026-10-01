import { resumeElapsedSec } from './sessionTime';
import type { SessionResume } from '../session/ActiveSessionContext';
import type { ResumePlanEntry } from '../session/resumeSession';
import { isOpenWorkout, LIFECYCLE_COLUMNS, setCountOf, type SetCount } from '../../supabase/functions/_shared/workout-lifecycle';

export interface ResumableWorkout {
  workoutLogId: string;
  planSessionId: string;
  focus: string | null;
  sets: SetCount;
  resume: SessionResume;
}

export const RESUMABLE_COLUMNS = `id, at, status, plan_session_id, exercises_done, vs_planned, duration_sec, ${LIFECYCLE_COLUMNS}, plan_session!workout_log_plan_session_id_fkey(focus)`;

export const toResumableWorkout = (row: any, now: number = Date.now()): ResumableWorkout | null => {
  if (!row?.id || !row.plan_session_id || !isOpenWorkout(row, now)) return null;
  const exercisesDone = Array.isArray(row.exercises_done) ? row.exercises_done : [];
  if (exercisesDone.length === 0) return null;
  const vsPlanned = row.vs_planned ?? {};
  const planSession = Array.isArray(row.plan_session) ? row.plan_session[0] : row.plan_session;
  return {
    workoutLogId: row.id,
    planSessionId: row.plan_session_id,
    focus: planSession?.focus ?? null,
    sets: setCountOf(row),
    resume: {
      exercisesDone,
      sessionPlan: Array.isArray(vsPlanned.exercises) ? (vsPlanned.exercises as ResumePlanEntry[]) : null,
      workoutLogId: row.id,
      elapsedSec: resumeElapsedSec(typeof row.duration_sec === 'number' ? row.duration_sec : null, row.at, now),
      restOverrideSec: typeof vsPlanned.rest_override_sec === 'number' ? vsPlanned.rest_override_sec : null,
      restByExercise:
        vsPlanned.rest_by_exercise && typeof vsPlanned.rest_by_exercise === 'object' ? vsPlanned.rest_by_exercise : null,
    },
  };
};
