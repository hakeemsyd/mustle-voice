import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface ExerciseNote {
  id: string;
  note: string;
  at: string;
}

export interface ExerciseLastTime {
  at: string;
  sets: number;
  reps: string;
  load: string;
}

export interface ExerciseGuide {
  loading: boolean;
  notes: ExerciseNote[];
  lastTime: ExerciseLastTime | null;
}

/**
 * Everything the Guide sheet knows about one exercise: the coach's own past replies while
 * that exercise was live (exercise_note), and the last time it was actually logged, dug
 * out of workout_log's exercises_done payload.
 */
export function useExerciseGuide(exerciseId: string | null, exerciseName: string | null): ExerciseGuide {
  const [state, setState] = useState<ExerciseGuide>({ loading: true, notes: [], lastTime: null });

  useEffect(() => {
    let cancelled = false;

    if (!exerciseId || !exerciseName) {
      setState({ loading: false, notes: [], lastTime: null });
      return;
    }

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setState({ loading: false, notes: [], lastTime: null });
        return;
      }

      const [noteRes, logRes] = await Promise.all([
        supabase
          .from('exercise_note')
          .select('id, note, at')
          .eq('user_id', userId)
          .eq('exercise_id', exerciseId)
          .order('at', { ascending: false })
          .limit(5),
        supabase
          .from('workout_log')
          .select('at, exercises_done')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(40),
      ]);

      if (cancelled) return;

      let lastTime: ExerciseLastTime | null = null;
      for (const row of (logRes.data ?? []) as any[]) {
        const match = (row.exercises_done ?? []).find(
          (done: any) => typeof done?.name === 'string' && done.name.toLowerCase() === exerciseName.toLowerCase(),
        );
        if (match) {
          lastTime = { at: row.at, sets: match.sets, reps: match.reps, load: match.load };
          break;
        }
      }

      setState({
        loading: false,
        notes: (noteRes.data ?? []) as ExerciseNote[],
        lastTime,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [exerciseId, exerciseName]);

  return state;
}
