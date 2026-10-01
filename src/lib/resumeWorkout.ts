import { supabase } from './supabase';
import { RESUMABLE_COLUMNS, toResumableWorkout, type ResumableWorkout } from './resumePayload';

export { RESUMABLE_COLUMNS, toResumableWorkout, type ResumableWorkout };

export const fetchResumableWorkout = async (
  userId: string,
  planSessionId: string | null = null,
): Promise<ResumableWorkout | null> => {
  let query = supabase
    .from('workout_log')
    .select(RESUMABLE_COLUMNS)
    .eq('user_id', userId)
    .in('status', ['partial', 'interrupted'])
    .is('ended_at', null);
  if (planSessionId) query = query.eq('plan_session_id', planSessionId);
  const { data, error } = await query.order('last_activity_at', { ascending: false }).limit(1).maybeSingle();
  if (error) {
    console.error('[resume] failed to look up an unfinished workout:', error.message);
    return null;
  }
  return toResumableWorkout(data);
};
