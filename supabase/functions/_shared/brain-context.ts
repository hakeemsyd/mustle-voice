interface PlanSessionRow {
  id: string;
  day_order: number;
  weekday: number | null;
  focus: string;
  plan_exercise?: { ord: number; exercise: { name: string } | null }[];
}

interface WorkoutLogRow {
  at: string;
  plan_session_id: string | null;
  status?: string | null;
}

// The server runs in UTC, but "today"/"same day" only means anything relative to where the
// user actually is — a user ahead of UTC (e.g. Asia/Karachi, +5) hits their own midnight hours
// before the server's, so blindly using `new Date()` reports yesterday's date/rotation well
// into their next day. Returns a Date whose UTC-equivalent getters read as that timezone's
// wall-clock time for the given instant — every day-boundary check below assumes UTC getters,
// so both `now` AND every logged timestamp must go through this before being compared, or
// they'd be in two different timezones relative to each other.
export function toTimezone(date: Date, timezone: string | null | undefined): Date {
  if (!timezone) return date;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    return new Date(
      Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')),
    );
  } catch {
    return date;
  }
}

export function nowInTimezone(timezone: string | null | undefined): Date {
  return toTimezone(new Date(), timezone);
}

// resolveTodaySession/sameLocalDay compare `now` against each log's `.at` — both sides must be
// shifted into the same timezone or "same day" silently compares two different calendars.
export function logsInTimezone<T extends WorkoutLogRow>(logs: T[], timezone: string | null | undefined): T[] {
  if (!timezone) return logs;
  return logs.map((log) => ({ ...log, at: toTimezone(new Date(log.at), timezone).toISOString() }));
}

function isPartial(log: WorkoutLogRow): boolean {
  return log.status === 'partial';
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function resolveTodaySession(
  sessions: PlanSessionRow[],
  logs: WorkoutLogRow[],
  now: Date,
): PlanSessionRow | null {
  if (sessions.length === 0) return null;

  const scheduled = sessions.find((s) => s.weekday === now.getDay());
  if (scheduled) return scheduled;

  const flexible = sessions.every((s) => s.weekday === null || s.weekday === undefined);
  if (!flexible) return null;

  const completedToday = logs.some((log) => !isPartial(log) && sameLocalDay(new Date(log.at), now));
  if (completedToday) return null;

  const rotation = sessions.slice().sort((a, b) => a.day_order - b.day_order);
  const inPlan = new Set(rotation.map((s) => s.id));

  const lastLogged = logs
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .find((log) => log.plan_session_id && inPlan.has(log.plan_session_id));

  if (!lastLogged) return rotation[0];

  const lastIndex = rotation.findIndex((s) => s.id === lastLogged.plan_session_id);
  if (lastIndex === -1) return rotation[0];
  if (isPartial(lastLogged)) return rotation[lastIndex];
  return rotation[(lastIndex + 1) % rotation.length];
}

function describeSession(session: PlanSessionRow): string {
  const exercises = (session.plan_exercise ?? [])
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((e) => e.exercise?.name)
    .filter((name): name is string => Boolean(name))
    .join(', ');
  return `"${session.focus}" — ${exercises || 'no exercises listed'}`;
}

export async function buildContextBlock(supabase: any, userId: string): Promise<string> {
  const [{ data: profile }, { data: activePlan }, { data: recentLogs }] = await Promise.all([
    supabase.from('profile').select('timezone').eq('user_id', userId).maybeSingle(),
    supabase
      .from('training_plan')
      .select('plan_session(id, day_order, weekday, focus, plan_exercise(ord, exercise(name)))')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('workout_log')
      .select('at, plan_session_id, status')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      .limit(10),
  ]);

  const now = nowInTimezone(profile?.timezone);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const dateLine = `Right now it is ${weekday}, ${now.toISOString().slice(0, 10)} (${profile?.timezone ?? 'UTC'} time).`;

  const sessions: PlanSessionRow[] = activePlan?.plan_session ?? [];
  const logs: WorkoutLogRow[] = logsInTimezone(recentLogs ?? [], profile?.timezone);

  let planLine: string;
  if (sessions.length === 0) {
    planLine = 'No active training plan yet.';
  } else {
    const today = resolveTodaySession(sessions, logs, now);
    if (!today) {
      planLine = 'Today is a rest day — no scheduled session.';
    } else {
      const alreadyDone = logs.some(
        (log) => log.plan_session_id === today.id && log.status !== 'partial' && sameLocalDay(new Date(log.at), now),
      );
      planLine = alreadyDone
        ? `Today's scheduled session (${describeSession(today)}) was already completed today.`
        : `Today's scheduled session: ${describeSession(today)}.`;
    }
  }

  const lastLog = logs[0];
  const historyLine = lastLog
    ? `Most recent logged workout: ${new Date(lastLog.at).toISOString().slice(0, 10)} (${lastLog.status ?? 'completed'}).`
    : 'No workouts logged yet.';

  return (
    "Current context — you already know this, never ask the user for it:\n" +
    `- ${dateLine}\n- ${planLine}\n- ${historyLine}`
  );
}
