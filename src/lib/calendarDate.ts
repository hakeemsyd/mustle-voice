export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Local midnight for a YYYY-MM-DD key. `new Date("2026-09-12T00:00:00")` looks local but Hermes
 *  parses that form as UTC, so any window built from it is shifted by the device's offset. A week-
 *  or month-wide query absorbs that silently; a one-day window built the same way misses the day's
 *  own rows entirely — confirmed live, a logged workout showed on the Week and Month views but the
 *  day sheet for that same day read "No facts yet for this day". The numeric constructor has no
 *  such ambiguity. */
export function startOfLocalDay(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function sameLocalDay(a: Date, b: Date): boolean {
  return localDateKey(a) === localDateKey(b);
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const monthFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (sameMonth) return `${weekStart.getDate()}–${end.getDate()} ${monthFmt(weekStart)}`;
  return `${monthFmt(weekStart)} ${weekStart.getDate()} – ${monthFmt(end)} ${end.getDate()}`;
}
