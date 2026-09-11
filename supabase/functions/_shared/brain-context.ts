import { humanizeFocus } from './humanize.ts';
import { finalizeStaleLiveSession } from './interrupted-session.ts';
import { LIVE_STATE_MAX_AGE_MS } from './live-session-format.ts';
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

// toTimezone's output is a "fake UTC" Date — its UTC getters read as the target timezone's wall
// clock, but its real getTime() is NOT a real instant, so it must never be used directly as a
// database query boundary (a real `at` column holds genuine UTC instants). This returns a REAL,
// query-safe UTC Date for "midnight, in this timezone, today": the gap between `now` and its
// fake-UTC form is exactly the timezone's current offset, so subtracting that same gap from
// fake-UTC midnight gives the real UTC instant that midnight actually falls at.
export function startOfLocalDayUtc(timezone: string | null | undefined): Date {
  const now = new Date();
  const fakeUtcNow = toTimezone(now, timezone);
  const offsetMs = fakeUtcNow.getTime() - now.getTime();
  const fakeUtcMidnight = new Date(fakeUtcNow);
  fakeUtcMidnight.setUTCHours(0, 0, 0, 0);
  return new Date(fakeUtcMidnight.getTime() - offsetMs);
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

// An 'interrupted' session (see interrupted-session.ts) is just as unresolved as a 'partial' one
// — neither should advance a flexible rotation or count as "done today" until the coach has
// actually reconciled what happened, so both are treated identically here.
function isPartial(log: WorkoutLogRow): boolean {
  return log.status === 'partial' || log.status === 'interrupted';
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

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Every turn only ever got told about TODAY's single resolved session — no ground truth for any
// other day, or for the rotation/schedule as a whole. A conversational question that didn't
// happen to trigger show_plan_breakdown (a tool, not always called) had nothing real to answer
// from, and the model filled that gap by inventing a schedule — confirmed live: self-contradictory
// day-labeling ("Sunday starts Push, Monday is Day 1 Push, Tuesday is Pull") and a "what's my
// week look like" question that just repeated the focus names with no real per-day structure.
// This gives every turn the real week/rotation as plain ground truth, independent of whether any
// tool gets called.
function describeWeeklyPlan(sessions: PlanSessionRow[]): string {
  const pinned = sessions.some((s) => s.weekday !== null && s.weekday !== undefined);
  if (pinned) {
    const byWeekday = new Map(sessions.map((s) => [s.weekday, s]));
    const days = WEEKDAY_NAMES.map((name, i) => {
      const s = byWeekday.get(i);
      return `${name}: ${s ? humanizeFocus(s.focus) : 'Rest'}`;
    });
    return `Weekly schedule (fixed to these weekdays): ${days.join(', ')}.`;
  }

  const rotation = sessions.slice().sort((a, b) => a.day_order - b.day_order);
  return (
    `Training rotation (repeats in this order, NOT tied to specific weekdays — which real ` +
    `calendar day each falls on depends on when the last one was actually done): ` +
    `${rotation.map((s) => humanizeFocus(s.focus)).join(' → ')}, then repeats.`
  );
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
  // Must resolve before anything below reads workout_log/live_session_state — it can insert a
  // fresh 'interrupted' row and always clears any stale live_session_state row, both of which
  // the rest of this function (and resolveTodaySession's rotation logic) need to see this turn,
  // not next turn.
  // TEMPORARY — voice-timing instrumentation. Remove once the slow phase is identified.
  const tStale0 = Date.now();
  await finalizeStaleLiveSession(supabase, userId, LIVE_STATE_MAX_AGE_MS);
  console.log(`[voice-timing:server] finalizeStaleLiveSession: +${Date.now() - tStale0}ms`);

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: profile }, { data: activePlan }, { data: recentLogs }, restDayDates, { data: interrupted }] = await Promise.all([
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
    supabase
      .from('workout_log')
      .select('id, at, exercises_done, plan_session(focus)')
      .eq('user_id', userId)
      .eq('status', 'interrupted')
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const timezone = requestTimezone || profile?.timezone || null;
  if (requestTimezone && requestTimezone !== profile?.timezone) {
    const { error } = await supabase.from('profile').update({ timezone: requestTimezone }).eq('user_id', userId);
    if (error) console.error('[brain] failed to refresh profile.timezone:', error.message);
  }

  const now = nowInTimezone(timezone);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  // Time of day was missing entirely before this — every turn (including the daily greeting)
  // only ever knew the date, never whether it's 7am or 9pm, so a greeting could read "good
  // morning"-generic at any hour and nothing could reason about morning/evening context at all.
  const timeOfDay = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const dateLine =
    `Right now it is ${timeOfDay} on ${weekday}, ${now.toISOString().slice(0, 10)} (${timezone ?? 'UTC'} time).`;

  const sessions: PlanSessionRow[] = activePlan?.plan_session ?? [];
  const logs: WorkoutLogRow[] = logsInTimezone(recentLogs ?? [], timezone);

  const weeklyPlanLine = sessions.length > 0 ? describeWeeklyPlan(sessions) : null;

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
        (log) => log.plan_session_id === today.id && !isPartial(log) && sameLocalDay(new Date(log.at), now),
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

  // Surfaced every turn (not just the first) so the model can still act on it if the user brings
  // it up mid-conversation — but instructed to only actually RAISE it unprompted once, near the
  // start of a new conversation, not re-nag every turn if the user moves on without addressing it.
  const interruptedFocus = humanizeFocus(interrupted?.plan_session?.focus ?? 'training');
  const interruptedLine = interrupted
    ? `An earlier "${interruptedFocus}" workout was interrupted and never finished or reconciled ` +
      `(${new Date(interrupted.at).toISOString().slice(0, 10)}, ${(interrupted.exercises_done ?? []).length} ` +
      `exercise(s) logged before it cut off, id ${interrupted.id}). Near the start of a genuinely new ` +
      `conversation, briefly ask what happened — did they finish it without the app, end early, or want ` +
      `to discard it — then call resolve_interrupted_workout with that workout_log_id. Don't re-raise ` +
      `this if the user is already mid-topic on something else; wait for a natural moment or for them ` +
      `to bring it up.`
    : null;

  return (
    "Current context — you already know this, never ask the user for it:\n" +
    `- ${dateLine}\n- ${planLine}\n` +
    (weeklyPlanLine ? `- ${weeklyPlanLine}\n` : '') +
    (interruptedLine ? `- ${interruptedLine}\n` : '') +
    `- ${historyLine}`
  );
}
