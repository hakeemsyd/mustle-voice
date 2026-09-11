// A workout that never got a formal end (app closed, killed, or just abandoned mid-session)
// leaves its live_session_state row sitting there indefinitely — nothing else ever closes it.
// Called once near the start of every brain/brain-voice request: if that row has gone stale
// (LIVE_STATE_MAX_AGE_MS, see live-session-format.ts), whatever sets were actually logged get
// preserved as a real workout_log row (status 'interrupted') and the live row is cleared, so the
// coach can ask what happened on the user's next turn rather than the session sitting "active"
// for hours. A session with zero logged sets (and, for cardio, zero elapsed time) is discarded
// silently — there's nothing to ask about, matching the same "don't save a workout nobody did"
// rule the manual Workout Done path already follows.
export async function finalizeStaleLiveSession(
  supabase: any,
  userId: string,
  maxAgeMs: number,
): Promise<{ finalized: boolean; workoutLogId: string | null }> {
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

  const { data, error } = await supabase
    .from('workout_log')
    .insert({
      user_id: userId,
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
}
