import type { SessionExercise } from './ActiveSessionContext';
import { normalizeLoadScheme } from '../../supabase/functions/_shared/load-intent';

export interface ResumePlanEntry {
  name: string;
  planned_sets: number;
  exercise_id?: string | null;
  rep_scheme?: string | null;
  load_scheme?: string | null;
}

const key = (name: string): string => name.trim().toLowerCase();

const findReplaced = (plan: SessionExercise[], name: string, taken: Set<number>): number => {
  const wanted = key(name);
  return plan.findIndex((ex, i) => {
    if (taken.has(i)) return false;
    const planName = key(ex.name);
    return wanted.includes(planName) || planName.includes(wanted);
  });
};

export const rebuildResumedSession = (
  plan: SessionExercise[],
  sessionPlan: ResumePlanEntry[] | null | undefined,
  doneNames: string[],
): SessionExercise[] => {
  const entries = (sessionPlan ?? []).filter((e) => e && typeof e.name === 'string' && e.name.trim());
  const planByName = new Map(plan.map((ex) => [key(ex.name), ex]));

  if (entries.length > 0 && entries.every((e) => typeof e.rep_scheme === 'string')) {
    return entries.map((entry, i) => {
      const match = planByName.get(key(entry.name));
      return {
        id: match?.id ?? `resume:${i}:${key(entry.name)}`,
        exerciseId: entry.exercise_id ?? match?.exerciseId ?? '',
        name: entry.name,
        sets: Math.max(1, Number(entry.planned_sets) || match?.sets || 1),
        repScheme: entry.rep_scheme ?? match?.repScheme ?? '',
        loadScheme: normalizeLoadScheme(entry.load_scheme ?? match?.loadScheme ?? null),
      };
    });
  }

  if (entries.length === plan.length && entries.length > 0) {
    return plan.map((ex, i) =>
      key(entries[i].name) === key(ex.name)
        ? ex
        : { ...ex, name: entries[i].name, exerciseId: '', sets: Math.max(1, Number(entries[i].planned_sets) || ex.sets) },
    );
  }

  const rebuilt = plan.map((ex) => ({ ...ex }));
  const taken = new Set<number>(rebuilt.flatMap((ex, i) => (doneNames.some((n) => key(n) === key(ex.name)) ? [i] : [])));
  const extras: SessionExercise[] = [];
  for (const name of doneNames) {
    if (planByName.has(key(name))) continue;
    const index = findReplaced(rebuilt, name, taken);
    if (index >= 0) {
      rebuilt[index] = { ...rebuilt[index], name, exerciseId: '' };
      taken.add(index);
    } else {
      extras.push({ id: `resume:extra:${key(name)}`, exerciseId: '', name, sets: 1, repScheme: '', loadScheme: null });
    }
  }
  return [...extras, ...rebuilt];
};
