export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
