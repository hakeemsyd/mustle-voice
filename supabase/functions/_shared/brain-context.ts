import { humanizeFocus } from './humanize.ts';
import { finalizeStaleLiveSession } from './interrupted-session.ts';
import { LIVE_STATE_MAX_AGE_MS } from './live-session-format.ts';
import { buildLoadHistory, describeLoadHistory } from './load-history.ts';
import { describeActiveInjuries, describeUnloggedPainReport } from './injury-context.ts';
import { describeTodaysFoodLog } from './food-log-context.ts';
import { describeImportedWorkout } from './rep-target.ts';
import { describeConsultationStatus } from './consultation-context.ts';

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
export function startOfLocalDayUtc(timezone: string | null | undefined, at: Date = new Date()): Date {
  const now = at;
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

/** A one-off session pinned to a specific date — what the coach builds when the user wants
 *  something other than what the plan says today (see write_custom_session). It outranks both the
 *  plan rotation and a rest day, so every "what's due today" question has to check it FIRST:
 *  a rest day that has been overridden is no longer a rest day. */
export async function fetchDayOverrideSession(
  supabase: any,
  userId: string,
  dateKey: string,
): Promise<PlanSessionRow | null> {
  const { data, error } = await supabase
    .from('day_override')
    // Selects the superset every caller needs (sets/rep_scheme for show_daily_workout's card, the
    // name for every context line) rather than a per-caller shape — one query, and no caller can
    // silently get back a session missing the fields it reads.
    .select(
      'plan_session(id, day_order, weekday, focus, plan_exercise(ord, sets, rep_scheme, load_scheme, exercise(name)))',
    )
    .eq('user_id', userId)
    .eq('date', dateKey)
    .maybeSingle();
  if (error) {
    console.error('[brain] failed to read day_override:', error.message);
    return null;
  }
  const session = (data as any)?.plan_session ?? null;
  return Array.isArray(session) ? (session[0] ?? null) : session;
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

const holdsRotation = (log: WorkoutLogRow, now: Date): boolean =>
  isPartial(log) && sameLocalDay(new Date(log.at), now);

const wasFinishedToday = (logs: WorkoutLogRow[], sessionId: string, now: Date): boolean =>
  logs.some(
    (log) => log.plan_session_id === sessionId && !isPartial(log) && sameLocalDay(new Date(log.at), now),
  );

const byMostRecentFinishedFirst = (a: WorkoutLogRow, b: WorkoutLogRow): number => {
  const byTime = new Date(b.at).getTime() - new Date(a.at).getTime();
  if (byTime !== 0) return byTime;
  return Number(isPartial(a)) - Number(isPartial(b));
};

export function resolveTodaySession(
  sessions: PlanSessionRow[],
  logs: WorkoutLogRow[],
  now: Date,
  restDayDates: Set<string> = new Set(),
  dayOverride: PlanSessionRow | null = null,
  planStartDate: string | null = null,
): PlanSessionRow | null {
  // Checked before everything else, including the rest-day short-circuit: an override is the user
  // explicitly asking for this session today, so it outranks both a rest day and the rotation.
  // Whether the plan has any sessions at all is irrelevant — a custom session stands on its own.
  if (dayOverride) return wasFinishedToday(logs, dayOverride.id, now) ? null : dayOverride;
  if (sessions.length === 0) return null;
  if (restDayDates.has(now.toISOString().slice(0, 10))) return null;
  if (planStartDate && now.toISOString().slice(0, 10) < planStartDate) return null;

  const scheduled = sessions.find((s) => s.weekday === now.getDay());
  if (scheduled) return wasFinishedToday(logs, scheduled.id, now) ? null : scheduled;

  const flexible = sessions.every((s) => s.weekday === null || s.weekday === undefined);
  if (!flexible) return null;

  const completedToday = logs.some((log) => !isPartial(log) && sameLocalDay(new Date(log.at), now));
  if (completedToday) return null;

  const rotation = sessions.slice().sort((a, b) => a.day_order - b.day_order);
  const inPlan = new Set(rotation.map((s) => s.id));

  const lastLogged = logs
    .slice()
    .sort(byMostRecentFinishedFirst)
    .find((log) => log.plan_session_id && inPlan.has(log.plan_session_id));

  if (!lastLogged) return rotation[0];

  const lastIndex = rotation.findIndex((s) => s.id === lastLogged.plan_session_id);
  if (lastIndex === -1) return rotation[0];
  if (holdsRotation(lastLogged, now)) return rotation[lastIndex];
  return rotation[(lastIndex + 1) % rotation.length];
}

const NOT_A_NAME = /[[\]()]|^(?:test|unknown|n\/a|none)$/i;

export function describeUserName(displayName: string | null | undefined): string {
  const raw = (displayName ?? '').trim();
  const name = NOT_A_NAME.test(raw) || !/[a-zA-Z]/.test(raw) ? '' : raw;
  return name
    ? `The user's name is ${name}. You already know it — never say you don't have it on file and ` +
      `never ask what to call them. Use it sparingly, the way a coach does, not in every reply.`
    : `No name on file for this user. If they ask whether you know their name, say plainly that you ` +
      `don't have it yet and ask for it, then call update_profile with what they answer so it is on ` +
      `file from then on.`;
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
  currentUserText?: string | null,
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
  // The override lookup wants today's date in the user's timezone. The client sends its live
  // timezone on every call and that value wins over the stored one anyway, so on the normal path
  // it is known before any query runs and this can join the parallel batch. Only a request that
  // omits it falls back to a serial lookup after `profile` arrives.
  //
  // This matters more than it looks: ElevenLabs caps a custom LLM at 15 seconds per turn and
  // cannot be raised, so every avoidable round trip here is spent against that ceiling. Running
  // it serially added a whole trip to every single voice turn.
  const eagerTodayKey = requestTimezone ? nowInTimezone(requestTimezone).toISOString().slice(0, 10) : null;
  const eagerStartOfDay = requestTimezone ? startOfLocalDayUtc(requestTimezone) : null;
  const [
    { data: profile },
    { data: activePlan },
    { data: recentLogs },
    restDayDates,
    { data: interrupted },
    eagerOverride,
    { data: liveRow },
    { data: lastWeight },
    { data: activeInjuries, error: injuriesError },
    { data: eagerFoodToday },
    { data: consultationProgress },
  ] = await Promise.all([
    supabase.from('profile').select('timezone, unit_prefs, display_name').eq('user_id', userId).maybeSingle(),
    supabase
      .from('training_plan')
      .select('starts_on, plan_session(id, day_order, weekday, focus, plan_exercise(ord, exercise(name)))')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('workout_log')
      .select('at, plan_session_id, status, exercises_done, plan_session!workout_log_plan_session_id_fkey(focus)')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      .limit(10),
    fetchRestDayDates(supabase, userId, ninetyDaysAgo),
    supabase
      .from('workout_log')
      .select('id, at, exercises_done, plan_session!workout_log_plan_session_id_fkey(focus)')
      .eq('user_id', userId)
      .eq('status', 'interrupted')
      .order('at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    eagerTodayKey ? fetchDayOverrideSession(supabase, userId, eagerTodayKey) : Promise.resolve(null),
    supabase.from('live_session_state').select('updated_at').eq('user_id', userId).maybeSingle(),
    supabase
      .from('weight_log')
      .select('weight_kg, body_fat_pct, measured_at')
      .eq('user_id', userId)
      .order('measured_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('injury')
      .select('area, pain_level, severity, created_at')
      .eq('user_id', userId)
      .eq('status', 'active'),
    eagerStartOfDay
      ? supabase
          .from('food_log')
          .select('description, calories, protein_g, carbs_g, fat_g, at')
          .eq('user_id', userId)
          .gte('at', eagerStartOfDay.toISOString())
          .order('at', { ascending: true })
      : Promise.resolve({ data: null }),
    supabase.from('consultation_progress').select('topics').eq('user_id', userId).maybeSingle(),
  ]);

  const timezone = requestTimezone || profile?.timezone || null;
  // Deliberately not awaited. This is an opportunistic refresh of a stored convenience value;
  // nothing in this turn reads it back, and blocking the reply on a write is latency spent for
  // no benefit against the 15-second ceiling.
  if (requestTimezone && requestTimezone !== profile?.timezone) {
    void supabase
      .from('profile')
      .update({ timezone: requestTimezone })
      .eq('user_id', userId)
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) console.error('[brain] failed to refresh profile.timezone:', error.message);
      });
  }

  const now = nowInTimezone(timezone);
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  // Time of day was missing entirely before this — every turn (including the daily greeting)
  // only ever knew the date, never whether it's 7am or 9pm, so a greeting could read "good
  // morning"-generic at any hour and nothing could reason about morning/evening context at all.
  const timeOfDay = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const dateLine =
    `Right now it is ${timeOfDay} on ${weekday}, ${now.toISOString().slice(0, 10)} (${timezone ?? 'UTC'} time).`;

  // Working out which date "next Monday" is turned out to be a reliable way to get it wrong —
  // confirmed live twice, offering "start Monday, 2026-09-23" and "Monday 2026-09-30" when neither
  // date is a Monday. Listing the coming week removes the arithmetic: a weekday the user names maps
  // to a date stated here, and any date passed to a tool can be checked against it.
  const upcomingDays: string[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const day = new Date(now.getTime() + offset * 86_400_000);
    upcomingDays.push(`${day.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })} ${day.toISOString().slice(0, 10)}`);
  }
  const upcomingLine = `The next seven days are: ${upcomingDays.join(', ')}. Use these exact dates — never work out a date for a weekday yourself.`;

  const nameLine = describeUserName(profile?.display_name ?? null);

  const units = profile?.unit_prefs === 'imperial' ? 'imperial' : 'metric';
  const unitsLine =
    units === 'imperial'
      ? 'The user reads and speaks in POUNDS (lb). Every weight you say out loud or write must be in pounds, ' +
        'even though tools and stored data use kilograms. Convert before you speak: lb = kg x 2.205.'
      : 'The user reads and speaks in KILOGRAMS (kg). State every weight in kilograms.';

  const todayKey = now.toISOString().slice(0, 10);
  const dayOverride =
    eagerTodayKey === todayKey ? eagerOverride : await fetchDayOverrideSession(supabase, userId, todayKey);

  const foodToday =
    eagerTodayKey === todayKey
      ? eagerFoodToday
      : (
          await supabase
            .from('food_log')
            .select('description, calories, protein_g, carbs_g, fat_g, at')
            .eq('user_id', userId)
            .gte('at', startOfLocalDayUtc(timezone).toISOString())
            .order('at', { ascending: true })
        ).data;

  const sessions: PlanSessionRow[] = activePlan?.plan_session ?? [];
  const logs: WorkoutLogRow[] = logsInTimezone(recentLogs ?? [], timezone);
  const planStartDate: string | null = activePlan?.starts_on ?? null;
  const notYetStarted = !!planStartDate && todayKey < planStartDate;

  const weeklyPlanLine = sessions.length > 0 ? describeWeeklyPlan(sessions) : null;

  let planLine: string;
  if (sessions.length === 0 && !dayOverride) {
    planLine = 'No active training plan yet.';
  } else {
    const today = resolveTodaySession(sessions, logs, now, restDayDates, dayOverride, planStartDate);
    if (!today) {
      planLine = notYetStarted
        ? `A plan is set up and confirmed but hasn't started yet — it begins ${planStartDate}. Today is ` +
          `not a training day under it. If they want to start earlier, use update_plan_start_date; ` +
          `otherwise it begins on its own on that date.`
        : restDayDates.has(todayKey)
          ? 'Today is a rest day — the user chose to skip it.'
          : 'Today is a rest day — no scheduled session.';
    } else if (dayOverride) {
      // Spelled out as a one-off so the model doesn't start describing it as part of the program
      // and contradict the weekly schedule line sitting right next to it.
      planLine =
        `Today's session is a ONE-OFF custom session the user asked for, replacing whatever the ` +
        `plan had scheduled: ${describeSession(today)}. It exists in the app and is showing on ` +
        `Home with a Start button. The weekly plan itself is unchanged and resumes tomorrow.`;
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

  // A single "most recent workout" date was all the model ever got, which is not enough to answer
  // the questions users actually ask — "have I trained this week?", "what did I do last time?" —
  // so it either called read_state or, confirmed live, asserted the user had never logged anything
  // and hadn't trained this week. The rows are already fetched; spelling them out costs nothing
  // and makes the common question answerable without a tool call. The explicit "this is the whole
  // recent history" line matters as much as the list: without it, an empty list reads as "no data
  // available" rather than "genuinely none", which is the difference between asking and asserting.
  const startOfWeek = new Date(now);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
  startOfWeek.setUTCHours(0, 0, 0, 0);
  const completedLogs = logs.filter((log) => !isPartial(log));
  const thisWeekCount = completedLogs.filter((log) => new Date(log.at) >= startOfWeek).length;

  const historyLine =
    logs.length === 0
      ? 'Training history: no workouts logged yet, ever. This is confirmed, not missing data — ' +
        'say so plainly if asked, and never guess that they have trained.'
      : [
          `Training history (the ${logs.length} most recent logged workouts — this IS the record, ` +
            `not a sample; do not claim the user has never trained when rows are listed here):`,
          ...logs.map((log) => {
            const focus = humanizeFocus((log as any).plan_session?.focus ?? null);
            const date = new Date(log.at).toISOString().slice(0, 10);
            return `  - ${date}: ${focus} (${log.status ?? 'completed'})`;
          }),
          `Completed workouts so far this calendar week (since Sunday): ${thisWeekCount}.`,
        ].join('\n');

  // Surfaced every turn (not just the first) so the model can still act on it if the user brings
  // it up mid-conversation — but instructed to only actually RAISE it unprompted once, near the
  // start of a new conversation, not re-nag every turn if the user moves on without addressing it.
  const sessionIsLive =
    !!liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
  const interruptedFocus = humanizeFocus(interrupted?.plan_session?.focus ?? 'training');
  const interruptedLine =
    interrupted && !sessionIsLive
      ? `An earlier "${interruptedFocus}" workout was interrupted and never finished or reconciled ` +
        `(${new Date(interrupted.at).toISOString().slice(0, 10)}, ${(interrupted.exercises_done ?? []).length} ` +
        `exercise(s) logged before it cut off, id ${interrupted.id}). Near the start of a genuinely new ` +
        `conversation, briefly ask what happened — did they finish it without the app, end early, or want ` +
        `to discard it — then call resolve_interrupted_workout with that workout_log_id. Don't re-raise ` +
        `this if the user is already mid-topic on something else; wait for a natural moment or for them ` +
        `to bring it up.`
      : null;

  const loadHistoryLine = describeLoadHistory(buildLoadHistory(recentLogs ?? []), units);

  const bodyStatsLine = lastWeight
    ? `Last recorded weight: ${
        units === 'imperial'
          ? `${Math.round(lastWeight.weight_kg * 2.20462 * 10) / 10} lb`
          : `${Math.round(lastWeight.weight_kg * 10) / 10} kg`
      }${lastWeight.body_fat_pct != null ? `, body fat ${lastWeight.body_fat_pct}%` : ''} ` +
      `(logged ${new Date(lastWeight.measured_at).toISOString().slice(0, 10)}). Use this when asked ` +
      `about current weight or body fat — don't ask again unless it's genuinely stale or they bring ` +
      `up a new measurement.`
    : null;

  const injuryLine = describeActiveInjuries(activeInjuries, !!injuriesError);
  const painReportLine = describeUnloggedPainReport(currentUserText);

  const importedWorkoutLine = describeImportedWorkout(currentUserText);

  const foodLogLine = describeTodaysFoodLog(foodToday ?? []);

  const consultationLine = describeConsultationStatus(!!activePlan, (consultationProgress?.topics ?? []) as string[]);

  // Stated every turn a plan exists, not only before it starts. Without it the model had no
  // authoritative value once the plan was running, and agreed to "stick with the original start
  // date, Monday" while the stored date was actually today — telling the user a date it had never
  // set. The date is only ever changed by update_plan_start_date, so saying so here is what makes
  // a claimed change verifiable rather than asserted.
  const startDateLine = planStartDate
    ? `Plan start date on record: ${planStartDate}. This is the ONLY source of truth for when the ` +
      `plan starts. Never tell the user it starts on a different date than this one, and never say ` +
      `you have changed or kept it unless you called update_plan_start_date in this same turn — ` +
      `if they ask for a different date, call that tool, and if it is already correct say so plainly.`
    : null;

  return (
    "Current context — you already know this, never ask the user for it:\n" +
    `- ${nameLine}\n- ${dateLine}\n- ${upcomingLine}\n- ${unitsLine}\n- ${planLine}\n` +
    (startDateLine ? `- ${startDateLine}\n` : '') +
    (weeklyPlanLine ? `- ${weeklyPlanLine}\n` : '') +
    (consultationLine ? `- ${consultationLine}\n` : '') +
    (interruptedLine ? `- ${interruptedLine}\n` : '') +
    `- ${historyLine}` +
    (loadHistoryLine ? `\n- ${loadHistoryLine}` : '') +
    (bodyStatsLine ? `\n- ${bodyStatsLine}` : '') +
    (injuryLine ? `\n- ${injuryLine}` : '') +
    (painReportLine ? `\n- ${painReportLine}` : '') +
    (importedWorkoutLine ? `\n- ${importedWorkoutLine}` : '') +
    (foodLogLine ? `\n- ${foodLogLine}` : '')
  );
}
