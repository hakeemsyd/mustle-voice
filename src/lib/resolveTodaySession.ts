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

function isPartial(log: WorkoutLogRow): boolean {
  return log.status === 'partial';
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
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
): T | null {
  if (sessions.length === 0) return null;

  const scheduled = sessions.find((s) => s.weekday === now.getDay());
  if (scheduled) return scheduled;

  // Rotate only for a genuinely flexible split. If any session in the plan is pinned to a
  // weekday, a day with no match is a real rest day and must stay one.
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
