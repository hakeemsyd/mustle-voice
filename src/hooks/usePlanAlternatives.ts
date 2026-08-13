import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface PlanAlternative {
  planSessionId: string;
  focus: string;
  exerciseCount: number;
}

/**
 * The other sessions in the user's active plan — what Switch Workout offers as strength
 * alternatives. Real plan data rather than a generated session: swapping Push for the Pull
 * day you already have programmed is both instant and the thing a flexible-split user
 * actually wants.
 */
export function usePlanAlternatives(excludePlanSessionId?: string) {
  const [alternatives, setAlternatives] = useState<PlanAlternative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('training_plan')
        .select('id, plan_session(id, day_order, focus, session_type, plan_exercise(id))')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (cancelled) return;

      const rows = ((data?.plan_session ?? []) as any[])
        .filter((s) => s.id !== excludePlanSessionId && (s.session_type ?? 'strength') === 'strength')
        .sort((a, b) => a.day_order - b.day_order)
        .map((s) => ({
          planSessionId: s.id as string,
          focus: (s.focus as string | null) ?? 'Training',
          exerciseCount: (s.plan_exercise ?? []).length,
        }));

      setAlternatives(rows);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [excludePlanSessionId]);

  return { alternatives, loading };
}
