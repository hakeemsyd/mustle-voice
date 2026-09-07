import { humanizeFocus } from './humanize.ts';
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
// shifted into the same timezone or "same day" silently compares two different calendars. Any
// timestamped row can go through this, not just workout logs — computeStatsSnapshot uses it for
// food_log rows too, which is why the constraint is the minimal `{at: string}` shape rather than
// the full WorkoutLogRow.
export function logsInTimezone<T extends { at: string }>(logs: T[], timezone: string | null | undefined): T[] {
  if (!timezone) return logs;
  return logs.map((log) => ({ ...log, at: toTimezone(new Date(log.at), timezone).toISOString() }));
}

export async function fetchRestDayDates(supabase: any, userId: string, sinceIso: string): Promise<Set<string>> {
  const { data } = await supabase.from('rest_day').select('date').eq('user_id', userId).gte('date', sinceIso);
  return new Set((data ?? []).map((r: any) => r.date));
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
  restDayDates: Set<string> = new Set(),
): PlanSessionRow | null {
  if (sessions.length === 0) return null;
  if (restDayDates.has(now.toISOString().slice(0, 10))) return null;

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
  return `"${humanizeFocus(session.focus)}" — ${exercises || 'no exercises listed'}`;
}

// The client's live device timezone, sent with every request, always wins over what's stored —
// profile.timezone was only ever written once at onboarding and never refreshed, so after travel
// or DST it silently drifts from where the user actually is, misclassifying which local day a
// meal or workout falls on. Confirmed live: a meal logged late at night got pulled into "today"
// a full day off. Stored value remains only as a fallback for the rare request that omits it.
export async function buildContextBlock(
  supabase: any,
  userId: string,
  requestTimezone?: string | null,
): Promise<string> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: profile }, { data: activePlan }, { data: recentLogs }, restDayDates] = await Promise.all([
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
    fetchRestDayDates(supabase, userId, ninetyDaysAgo),
  ]);

  const timezone = requestTimezone || profile?.timezone || null;
  if (requestTimezone && requestTimezone !== profile?.timezone) {
    const { error } = await supabase.from('profile').update({ timezone: requestTimezone }).eq('user_id', userId);
    if (error) console.error('[brain] failed to refresh profile.timezone:', error.message);
  }

  const now = nowInTimezone(timezone);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const dateLine = `Right now it is ${weekday}, ${now.toISOString().slice(0, 10)} (${timezone ?? 'UTC'} time).`;

  const sessions: PlanSessionRow[] = activePlan?.plan_session ?? [];
  const logs: WorkoutLogRow[] = logsInTimezone(recentLogs ?? [], timezone);

  let planLine: string;
  if (sessions.length === 0) {
    planLine = 'No active training plan yet.';
  } else {
    const today = resolveTodaySession(sessions, logs, now, restDayDates);
    if (!today) {
      planLine = restDayDates.has(now.toISOString().slice(0, 10))
        ? 'Today is a rest day — the user chose to skip it.'
        : 'Today is a rest day — no scheduled session.';
    } else {
      const alreadyDone = logs.some(
        (log) => log.plan_session_id === today.id && log.status !== 'partial' && sameLocalDay(new Date(log.at), now),
      );
      planLine = alreadyDone
        ? `Today's scheduled session (${describeSession(today)}) was already completed today.`
        : `Today's scheduled session (scheduled, not started unless a live session state block ` +
          `below says otherwise): ${describeSession(today)}.`;
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
