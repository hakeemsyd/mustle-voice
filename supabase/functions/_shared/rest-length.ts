export type RestLengthScope = 'current' | 'exercise' | 'workout' | 'always';

export type RestLengthSource = 'exercise' | 'workout' | 'saved';

export interface RestLengthRules {
  restByExercise?: Record<string, number> | null;
  restOverrideSec?: number | null;
  savedRestByExercise?: Record<string, number> | null;
}

export interface RestExerciseRef {
  name: string;
  exerciseId?: string | null;
}

export const REST_SCOPES_FROM_VERSION = 7;

export const restKeyOf = (name: string): string => name.trim().toLowerCase();

export const customRestFor = (
  exercise: RestExerciseRef | null | undefined,
  rules: RestLengthRules,
): { seconds: number; source: RestLengthSource } | null => {
  if (!exercise) return null;
  const own = rules.restByExercise?.[restKeyOf(exercise.name)];
  if (typeof own === 'number') return { seconds: own, source: 'exercise' };
  if (typeof rules.restOverrideSec === 'number') return { seconds: rules.restOverrideSec, source: 'workout' };
  const saved = exercise.exerciseId ? rules.savedRestByExercise?.[exercise.exerciseId] : undefined;
  if (typeof saved === 'number') return { seconds: saved, source: 'saved' };
  return null;
};

const REST_SOURCE_REASON: Record<RestLengthSource, string> = {
  exercise: 'they asked for it for this exercise, for the rest of this workout',
  workout: 'they asked for it for every exercise in this workout',
  saved: 'their saved rest for this exercise, used in every workout',
};

export const describeRestRules = (
  exercises: RestExerciseRef[],
  currentIndex: number,
  rules: RestLengthRules,
): string[] => {
  const lines: string[] = [];
  const current = exercises[currentIndex];
  const currentRest = customRestFor(current, rules);
  if (current && currentRest) {
    lines.push(`- Rest before each remaining ${current.name} set: ${currentRest.seconds}s (${REST_SOURCE_REASON[currentRest.source]}).`);
  }
  const seen = new Set(current ? [restKeyOf(current.name)] : []);
  const others: string[] = [];
  exercises.forEach((exercise) => {
    const key = restKeyOf(exercise.name);
    if (seen.has(key)) return;
    seen.add(key);
    const rest = customRestFor(exercise, rules);
    if (!rest || rest.source === 'workout') return;
    others.push(`${exercise.name} ${rest.seconds}s${rest.source === 'saved' ? ' (saved)' : ''}`);
  });
  if (others.length > 0) lines.push(`- Other rest lengths in effect: ${others.join(', ')}.`);
  if (typeof rules.restOverrideSec === 'number' && currentRest?.source !== 'workout') {
    lines.push(`- Every exercise without its own rest length rests ${rules.restOverrideSec}s (they asked for that for all exercises).`);
  }
  return lines;
};

export const describeRestScope =(scope: RestLengthScope, exerciseName: string | null, restRunning: boolean): string => {
  const name = exerciseName ?? 'this exercise';
  if (scope === 'current') return 'for the rest running now only';
  if (scope === 'workout') return `for every exercise in this workout${restRunning ? ', including the rest running now' : ''}`;
  if (scope === 'always') return `for ${name}, saved for future workouts too${restRunning ? ', starting with the rest running now' : ''}`;
  return `for the rest of ${name} in this workout${restRunning ? ', including the rest running now' : ''}`;
};
