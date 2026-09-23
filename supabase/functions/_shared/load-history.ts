type Units = 'metric' | 'imperial';

interface ExerciseDone {
  name?: unknown;
  reps?: unknown;
  load?: unknown;
}

interface WorkoutLogRow {
  at: string;
  exercises_done?: unknown;
}

export interface LastLoad {
  name: string;
  at: string;
  weightKg: number | null;
  reps: number | null;
  sets: number;
}

const MAX_EXERCISES = 12;

const lastNumber = (csv: unknown): number | null => {
  const parts = String(csv ?? '')
    .split(',')
    .map((p) => parseFloat(p.trim()))
    .filter((n) => Number.isFinite(n));
  return parts.length > 0 ? parts[parts.length - 1] : null;
};

const countEntries = (csv: unknown): number =>
  String(csv ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean).length;

export function buildLoadHistory(logs: WorkoutLogRow[]): LastLoad[] {
  const seen = new Map<string, LastLoad>();
  for (const log of logs) {
    const done = Array.isArray(log.exercises_done) ? (log.exercises_done as ExerciseDone[]) : [];
    for (const entry of done) {
      const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      const isBodyweight = String(entry?.load ?? '').trim().toLowerCase() === 'bodyweight';
      seen.set(key, {
        name,
        at: log.at,
        weightKg: isBodyweight ? null : lastNumber(entry?.load),
        reps: lastNumber(entry?.reps),
        sets: countEntries(entry?.reps),
      });
    }
  }
  return [...seen.values()].slice(0, MAX_EXERCISES);
}

const formatWeight = (kg: number, units: Units): string =>
  units === 'imperial' ? `${Math.round(kg * 2.20462)} lb` : `${Math.round(kg * 10) / 10} kg`;

export function describeLoadHistory(history: LastLoad[], units: Units): string | null {
  if (history.length === 0) return null;
  const lines = history.map((h) => {
    const load = h.weightKg != null ? formatWeight(h.weightKg, units) : 'bodyweight';
    const reps = h.reps != null ? `${h.reps} reps` : 'reps not recorded';
    return `  - ${h.name}: ${load} x ${reps} (${h.sets} set(s), ${h.at.slice(0, 10)})`;
  });
  return [
    'Last logged load per exercise (the most recent set the user actually completed on each). ' +
      'Use this when they ask what weight to use, and when opening an exercise they have done ' +
      'before: suggest the last load rather than asking cold, and never claim it is their first ' +
      'time on an exercise listed here. An exercise NOT listed here has genuinely never been ' +
      'logged, so ask for the weight in that case.',
    ...lines,
  ].join('\n');
}
