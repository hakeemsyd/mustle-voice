export interface PlanSessionRow {
  id: string;
  day_order: number;
  weekday: number | null;
}

export interface WorkoutLogRow {
  id?: string;
  at: string;
  plan_session_id: string | null;
  status?: string | null;
}

/**
 * Whether a logged workout is still unresolved. An 'interrupted' session (abandoned mid-workout,
 * awaiting the coach's reconciliation ask) is exactly as unfinished as a 'partial' one — neither
 * should advance a flexible rotation, count as "done today", extend a streak, or fill a training
 * slot until it has actually been resolved.
 *
 * THE single definition of "done", exported because every screen that reads workout_log.status
 * needs to agree. They did not: this module and the day-detail sheet treated 'interrupted' as
 * unfinished, while Calendar's Today and Week tabs and every Stats metric tested
 * `status !== 'partial'` and so counted it as a completed workout. The result was one screen
 * saying "Workout logged" while the sheet behind it offered a Start Session button for the same
 * day — confirmed live. Add a new status here, not at the call sites.
 */
export function isUnfinishedWorkout(status: string | null | undefined): boolean {
  return status === 'partial' || status === 'interrupted';
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function isPartial(log: WorkoutLogRow): boolean {
  return isUnfinishedWorkout(log.status);
}

export function wasFinishedToday(logs: WorkoutLogRow[], sessionId: string, now: Date): boolean {
  return logs.some(
    (log) => log.plan_session_id === sessionId && !isPartial(log) && sameLocalDay(new Date(log.at), now),
  );
}

/**
 * Most-recent-first, with finished sessions winning any tie on timestamp.
 *
 * Two rows can share an `at` to the second — a session and a leftover snapshot of itself, or two
 * logs written in the same instant. A plain sort leaves their order to whatever the input
 * happened to be, and the rotation pointer reads the FIRST match: finished advances it, unfinished
 * holds it. So the same data could resolve to two different sessions on different loads. Ordering
 * finished first makes the answer deterministic and picks the one that actually represents
 * completed work.
 */
/**
 * Whether an unfinished session should still block the rotation from advancing.
 *
 * Only on the day it happened. Resuming is a real option for a few hours: you stepped away
 * mid-workout and came back. It stops being one overnight — nobody finishes Tuesday's session on
 * Thursday — and an unbounded hold made the app read as stuck, offering the same workout every day
 * until something was completed. Confirmed live: an interrupted Tuesday session left Home showing
 * "Upper Pull" for the rest of the week while the plan had moved on.
 *
 * The log itself is untouched either way. What lapses is only the offer to resume; the sets stay
 * in history, and the coach still raises the unfinished session for reconciliation separately.
 */
export function holdsRotation(log: WorkoutLogRow, now: Date): boolean {
  return isUnfinishedWorkout(log.status) && sameLocalDay(new Date(log.at), now);
}

export function byMostRecentFinishedFirst(a: WorkoutLogRow, b: WorkoutLogRow): number {
  const byTime = new Date(b.at).getTime() - new Date(a.at).getTime();
  if (byTime !== 0) return byTime;
  return Number(isPartial(a)) - Number(isPartial(b));
}

// YYYY-MM-DD in the device's own local time — matches how rest_day.date rows are written
// (src/lib/restDay.ts) and read back.
export function localDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA').format(date);
}

/**
 * Which plan session, if any, is "today's" one.
 *
 * Weekday-pinned plans resolve by weekday. Flexible splits (push/pull/legs and friends) leave
 * `weekday` null and carry their order in `day_order` only — for those, today's session is the
 * next one in the rotation after the last one actually logged.
 *
 * Returns null for a rest day: no session matches today's weekday in a pinned plan, or the
 * rotation is already satisfied because a session was *completed* today. A partial session
 * neither ends the day nor advances the rotation — it is offered back so it can be resumed.
 */
export function resolveTodaySession<T extends PlanSessionRow>(
  sessions: T[],
  logs: WorkoutLogRow[],
  now: Date = new Date(),
  restDayDates: Set<string> = new Set(),
  dayOverride: T | null = null,
  planStartDate: string | null = null,
  trainingDays: number[] | null = null,
): T | null {
  // A one-off session the user asked the coach for (see write_custom_session) outranks everything
  // — the rotation, the weekday pinning, and a rest day. Checked first for that reason, and
  // regardless of whether the plan has any sessions at all: a custom session stands on its own.
  if (dayOverride) return wasFinishedToday(logs, dayOverride.id, now) ? null : dayOverride;
  if (sessions.length === 0) return null;
  if (restDayDates.has(localDateKey(now))) return null;
  if (planStartDate && localDateKey(now) < planStartDate) return null;

  const scheduled = sessions.find((s) => s.weekday === now.getDay());
  if (scheduled) return wasFinishedToday(logs, scheduled.id, now) ? null : scheduled;

  // Rotate only for a genuinely flexible split. If any session in the plan is pinned to a
  // weekday, a day with no match is a real rest day and must stay one.
  const flexible = sessions.every((s) => s.weekday === null || s.weekday === undefined);
  if (!flexible) return null;
  if (trainingDays && trainingDays.length > 0 && !trainingDays.includes(now.getDay())) return null;

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
