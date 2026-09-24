import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SessionExercise } from '../session/ActiveSessionContext';
import { normalizeLoadScheme } from '../../supabase/functions/_shared/load-intent';
import type { ResumePlanEntry } from '../session/resumeSession';

interface LoggedExercise {
  name: string;
  sets: number;
  reps: string;
  load: string;
}

export interface SessionPreview {
  loading: boolean;
  error: string | null;
  focus: string | null;
  exercises: SessionExercise[];
  /** Most recent run of this same plan session, for the "Last time" comparison — real history,
   *  not a placeholder. When status is "partial", this is also what the Continue Session path
   *  resumes from (see ActiveSessionContext.start's resumeExercisesDone param), and `id` is what
   *  Restart Instead deletes — choosing to restart is an explicit "discard this attempt", so the
   *  partial row it was offered from must not survive as accepted history once declined. */
  lastTime: {
    id: string;
    at: string;
    status: 'completed' | 'partial';
    exercises: LoggedExercise[];
    sessionPlan: ResumePlanEntry[] | null;
    durationSec: number | null;
  } | null;
}

interface PlanExerciseRow {
  id: string;
  exercise_id: string;
  ord: number;
  sets: number;
  rep_scheme: string;
  load_scheme: string;
  exercise: { name: string } | { name: string }[] | null;
}

function exerciseName(row: PlanExerciseRow): string {
  const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise;
  return exercise?.name ?? 'Exercise';
}

export function useSessionPreview(planSessionId: string): SessionPreview {
  const [state, setState] = useState<SessionPreview>({
    loading: true,
    error: null,
    focus: null,
    exercises: [],
    lastTime: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: 'Not signed in' }));
        return;
      }

      const [planRes, logRes] = await Promise.all([
        supabase
          .from('plan_session')
          .select('id, focus, plan_exercise(id, ord, sets, rep_scheme, load_scheme, exercise_id, exercise:exercise_id(name))')
          .eq('id', planSessionId)
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('workout_log')
          .select('id, at, status, exercises_done, vs_planned, duration_sec')
          .eq('user_id', userId)
          .eq('plan_session_id', planSessionId)
          .order('at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (cancelled) return;

      if (planRes.error || !planRes.data) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: planRes.error?.message ?? 'Session not found',
        }));
        return;
      }

      const rows = ((planRes.data.plan_exercise ?? []) as PlanExerciseRow[])
        .slice()
        .sort((a, b) => a.ord - b.ord);

      const lastRow = logRes.data;
      const lastTime = lastRow
        ? {
            id: lastRow.id as string,
            at: lastRow.at as string,
            status: (lastRow.status ?? 'completed') as 'completed' | 'partial',
            exercises: (lastRow.exercises_done ?? []) as LoggedExercise[],
            sessionPlan: Array.isArray(lastRow.vs_planned?.exercises)
              ? (lastRow.vs_planned.exercises as ResumePlanEntry[])
              : null,
            durationSec: typeof lastRow.duration_sec === 'number' ? lastRow.duration_sec : null,
          }
        : null;

      setState({
        loading: false,
        error: null,
        focus: planRes.data.focus ?? null,
        exercises: rows.map((row) => ({
          id: row.id,
          exerciseId: row.exercise_id,
          name: exerciseName(row),
          sets: row.sets,
          repScheme: row.rep_scheme,
          loadScheme: normalizeLoadScheme(row.load_scheme),
        })),
        lastTime,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [planSessionId]);

  return state;
}
