import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { SessionExercise } from '../session/ActiveSessionContext';

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
  /** Most recent completed run of this same plan session, for the "Last time"
   *  comparison — real history, not a placeholder. */
  lastTime: { at: string; exercises: LoggedExercise[] } | null;
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
          .select('at, exercises_done')
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
            at: lastRow.at as string,
            exercises: (lastRow.exercises_done ?? []) as LoggedExercise[],
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
          loadScheme: row.load_scheme,
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
