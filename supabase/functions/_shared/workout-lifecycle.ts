export const RESUME_WINDOW_MS = 24 * 60 * 60 * 1000;

export const FOLLOWUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const FOLLOWUP_ASKED_WINDOW_MS = 24 * 60 * 60 * 1000;

export const LIFECYCLE_COLUMNS = 'last_activity_at, ended_at, ended_by, followup_asked_at, followup_resolved_at';

export interface LifecycleRow {
  at: string;
  status?: string | null;
  last_activity_at?: string | null;
  ended_at?: string | null;
  ended_by?: string | null;
  followup_asked_at?: string | null;
  followup_resolved_at?: string | null;
}

export const isUnfinishedStatus = (status: string | null | undefined): boolean =>
  status === 'partial' || status === 'interrupted';

export const lastActivityMs = (row: LifecycleRow): number => {
  const activity = row.last_activity_at ? Date.parse(row.last_activity_at) : NaN;
  return Number.isFinite(activity) ? activity : Date.parse(row.at);
};

export const isOpenWorkout = (row: LifecycleRow, now: number = Date.now()): boolean =>
  isUnfinishedStatus(row.status) && !row.ended_at && now - lastActivityMs(row) < RESUME_WINDOW_MS;

export const endsTheDay = (row: LifecycleRow, now: number = Date.now()): boolean =>
  !isUnfinishedStatus(row.status) || !isOpenWorkout(row, now);

export const timedOut = (row: LifecycleRow, now: number = Date.now()): boolean =>
  isUnfinishedStatus(row.status) &&
  (row.ended_by === 'timeout' || (!row.ended_at && now - lastActivityMs(row) >= RESUME_WINDOW_MS));

export const needsFollowup = (row: LifecycleRow, now: number = Date.now()): boolean =>
  timedOut(row, now) && !row.followup_resolved_at && now - lastActivityMs(row) < FOLLOWUP_WINDOW_MS;

export const followupAskedRecently = (row: LifecycleRow, now: number = Date.now()): boolean =>
  !!row.followup_asked_at && now - Date.parse(row.followup_asked_at) < FOLLOWUP_ASKED_WINDOW_MS;

export const closeTimedOutWorkouts = async (supabase: any, userId: string, now: number = Date.now()): Promise<number> => {
  const { data, error } = await supabase
    .from('workout_log')
    .update({ ended_at: new Date(now).toISOString(), ended_by: 'timeout' })
    .eq('user_id', userId)
    .in('status', ['partial', 'interrupted'])
    .is('ended_at', null)
    .lt('last_activity_at', new Date(now - RESUME_WINDOW_MS).toISOString())
    .select('id');
  if (error) {
    console.error('[workout-lifecycle] failed to close timed-out workouts:', error.message);
    return 0;
  }
  return (data ?? []).length;
};

export interface SetCount {
  logged: number;
  planned: number | null;
}

export const setCountOf = (row: { exercises_done?: any; vs_planned?: any }): SetCount => {
  const done = Array.isArray(row.exercises_done) ? row.exercises_done : [];
  const logged = done.reduce((sum: number, exercise: any) => sum + (Number(exercise?.sets) || 0), 0);
  const planned = Number(row.vs_planned?.planned_sets);
  return { logged, planned: Number.isFinite(planned) && planned > 0 ? planned : null };
};

export const describeSetCount = ({ logged, planned }: SetCount): string =>
  planned ? `${logged} of ${planned} sets logged` : `${logged} set${logged === 1 ? '' : 's'} logged`;
