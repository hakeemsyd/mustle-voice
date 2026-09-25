const LEGACY_ROW_LOOKBACK_MS = 18 * 60 * 60 * 1000;

const findExistingRowId = async (supabase: any, userId: string, state: any, startedAt: string): Promise<string | null> => {
  if (typeof state.workoutLogId === 'string' && state.workoutLogId) return state.workoutLogId;
  const planSessionId = state.target?.type === 'strength' ? state.target.planSessionId : null;
  if (!planSessionId) return null;
  const { data } = await supabase
    .from('workout_log')
    .select('id')
    .eq('user_id', userId)
    .eq('plan_session_id', planSessionId)
    .in('status', ['partial', 'interrupted'])
    .gte('at', new Date(new Date(startedAt).getTime() - LEGACY_ROW_LOOKBACK_MS).toISOString())
    .order('at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
};

export const finalizeStaleLiveSession = async (
  supabase: any,
  userId: string,
  maxAgeMs: number,
): Promise<{ finalized: boolean; workoutLogId: string | null }> => {
  const { data: liveRow } = await supabase
    .from('live_session_state')
    .select('state, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!liveRow) return { finalized: false, workoutLogId: null };

  const age = Date.now() - new Date(liveRow.updated_at).getTime();
  if (age < maxAgeMs) return { finalized: false, workoutLogId: null };

  const state = liveRow.state ?? {};
  await supabase.from('live_session_state').delete().eq('user_id', userId);

  if (!state.target) return { finalized: false, workoutLogId: null };
  const isCardio = state.target.type === 'cardio';

  let exercisesDone: any[] = [];
  if (isCardio) {
    if (!state.elapsedSec) return { finalized: false, workoutLogId: null };
  } else {
    const exercises = state.exercises ?? [];
    const loggedSets = state.loggedSets ?? [];
    exercisesDone = exercises
      .map((exercise: any, i: number) => ({ exercise, sets: loggedSets[i] ?? [] }))
      .filter(({ sets }: any) => sets.length > 0)
      .map(({ exercise, sets }: any) => ({
        name: exercise.name,
        sets: sets.length,
        reps: sets.map((s: any) => s.reps).join(','),
        load: sets.every((s: any) => s.weight == null) ? 'bodyweight' : sets.map((s: any) => s.weight ?? '-').join(','),
        tracked: 'live',
      }));
    if (exercisesDone.length === 0) return { finalized: false, workoutLogId: null };
  }

  const startedAt =
    typeof state.startedAt === 'string' && !Number.isNaN(Date.parse(state.startedAt))
      ? state.startedAt
      : liveRow.updated_at;

  const existingId = await findExistingRowId(supabase, userId, state, startedAt);
  if (existingId) {
    const { data: updated, error: updateError } = await supabase
      .from('workout_log')
      .update({ status: 'interrupted', duration_sec: state.elapsedSec ?? 0, exercises_done: exercisesDone })
      .eq('id', existingId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();
    if (updateError) console.error('[interrupted-session] failed to mark session interrupted:', updateError.message);
    if (updated?.id) return { finalized: true, workoutLogId: updated.id };
  }

  const { data, error } = await supabase
    .from('workout_log')
    .insert({
      user_id: userId,
      at: startedAt,
      plan_session_id: state.target.type === 'strength' ? state.target.planSessionId : null,
      switched_from_session_id: state.target.switchedFromSessionId ?? null,
      session_type: isCardio ? 'cardio' : 'strength',
      cardio_activity: isCardio ? state.target.activity : null,
      duration_sec: state.elapsedSec ?? 0,
      exercises_done: exercisesDone,
      status: 'interrupted',
      source: 'mustle',
      note: null,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('[interrupted-session] failed to finalize stale session:', error.message);
    return { finalized: false, workoutLogId: null };
  }
  return { finalized: true, workoutLogId: data?.id ?? null };
};
