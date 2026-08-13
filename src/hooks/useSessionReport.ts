import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { buildSessionReport, type SessionReport, type WorkoutLogRecord } from '../lib/sessionReport';

interface State {
  loading: boolean;
  error: string | null;
  report: SessionReport | null;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function computeStreak(logTimestamps: string[], uptoAt: string): number {
  const days = new Set(logTimestamps.map((at) => dateKey(new Date(at))));
  const cursor = new Date(uptoAt);

  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function useSessionReport(workoutLogId: string): State {
  const [state, setState] = useState<State>({ loading: true, error: null, report: null });
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setState({ loading: false, error: 'Not signed in', report: null });
        return;
      }

      const { data: log, error: logError } = await supabase
        .from('workout_log')
        .select(
          'id, at, status, session_type, cardio_activity, duration_sec, plan_session_id, exercises_done, note, feedback_tags',
        )
        .eq('id', workoutLogId)
        .eq('user_id', userId)
        .maybeSingle();

      if (cancelled) return;
      if (logError || !log) {
        setState({ loading: false, error: logError?.message ?? 'Session not found', report: null });
        return;
      }

      // Same local-calendar-day convention useHomeData uses for "today" — the log's UTC
      // timestamp sliced by date would drift onto the wrong day near local midnight.
      const workoutDate = new Date(log.at);
      const startOfDay = new Date(workoutDate.getFullYear(), workoutDate.getMonth(), workoutDate.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 86_400_000);

      const [planRes, priorLogsRes, allLogsRes, nutritionRes, foodRes] = await Promise.all([
        log.plan_session_id
          ? supabase
              .from('plan_session')
              .select('focus, plan_exercise(sets)')
              .eq('id', log.plan_session_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        log.plan_session_id
          ? supabase
              .from('workout_log')
              .select('id, at, status, session_type, cardio_activity, duration_sec, plan_session_id, exercises_done, note, feedback_tags')
              .eq('user_id', userId)
              .eq('plan_session_id', log.plan_session_id)
              .neq('id', workoutLogId)
              .order('at', { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [] as WorkoutLogRecord[] }),
        supabase.from('workout_log').select('at').eq('user_id', userId).lte('at', log.at),
        supabase.from('nutrition_target').select('calories,protein_g,carbs_g').eq('user_id', userId).maybeSingle(),
        supabase
          .from('food_log')
          .select('calories,protein_g,carbs_g')
          .eq('user_id', userId)
          .gte('at', startOfDay.toISOString())
          .lt('at', endOfDay.toISOString()),
      ]);

      if (cancelled) return;

      const streakDays = computeStreak(((allLogsRes.data ?? []) as { at: string }[]).map((r) => r.at), log.at);

      const nutritionTarget = nutritionRes.data;
      const nutrition = nutritionTarget
        ? {
            proteinGoal: nutritionTarget.protein_g ?? 0,
            proteinCurrent: (foodRes.data ?? []).reduce((sum: number, r: any) => sum + (r.protein_g ?? 0), 0),
            caloriesGoal: nutritionTarget.calories ?? 0,
            caloriesCurrent: (foodRes.data ?? []).reduce((sum: number, r: any) => sum + (r.calories ?? 0), 0),
            carbsGoal: nutritionTarget.carbs_g ?? 0,
            carbsCurrent: (foodRes.data ?? []).reduce((sum: number, r: any) => sum + (r.carbs_g ?? 0), 0),
          }
        : null;

      const planTarget = planRes.data
        ? {
            focus: planRes.data.focus ?? null,
            totalSets: ((planRes.data.plan_exercise ?? []) as { sets: number }[]).reduce((sum, e) => sum + e.sets, 0),
          }
        : null;

      const report = buildSessionReport(
        log as WorkoutLogRecord,
        planTarget,
        (priorLogsRes.data ?? []) as WorkoutLogRecord[],
        streakDays,
        nutrition,
      );

      setState({ loading: false, error: null, report });
    })();

    return () => {
      cancelled = true;
    };
  }, [workoutLogId, refetchSignal]);

  return { ...state, refetch } as State & { refetch: () => void };
}
