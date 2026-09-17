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

/** Whole calendar days between two instants, in the device's local time — 0 for "same day",
 *  1 for "yesterday", regardless of the clock time on either side.
 *
 *  Both screens that label a past event used to divide the elapsed milliseconds by 86,400,000
 *  instead, which measures elapsed *hours* and answers a different question entirely: Friday
 *  11pm seen from Sunday 9:30pm is 46.5 hours, which reads as 1 (or, rounded, 2) and renders as
 *  "yesterday" for something two days ago. The error is worst exactly where people notice it,
 *  since an evening workout viewed the next evening lands near the rounding boundary. */
export function calendarDaysAgo(iso: string, now: Date = new Date()): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 0;
  const a = startOfLocalDay(localDateKey(then)).getTime();
  const b = startOfLocalDay(localDateKey(now)).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "Today" / "Yesterday" / "3 days ago" / "Sep 12". `capitalized` matches each caller's
 *  surrounding copy — Preview starts a line with it, Body embeds it mid-sentence. */
export function relativeDayLabel(iso: string, options: { capitalized?: boolean } = {}): string {
  const { capitalized = true } = options;
  const days = calendarDaysAgo(iso);
  if (days <= 0) return capitalized ? "Today" : "today";
  if (days === 1) return capitalized ? "Yesterday" : "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === end.getMonth();
  const monthFmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short" });
  if (sameMonth) return `${weekStart.getDate()}–${end.getDate()} ${monthFmt(weekStart)}`;
  return `${monthFmt(weekStart)} ${weekStart.getDate()} – ${monthFmt(end)} ${end.getDate()}`;
}
