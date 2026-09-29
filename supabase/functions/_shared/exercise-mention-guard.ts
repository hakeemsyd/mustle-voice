export const EXERCISE_NAMING_CUES = new Set([
  'session_start',
  'set_logged',
  'exercise_advanced',
  'exercise_advanced_rest',
  'rest_over',
  'rest_final_countdown',
  'silence_after_rest',
  'silence_after_rest_final',
]);

export const TRANSITION_CUES = new Set(['exercise_advanced', 'exercise_advanced_rest']);

const GENERIC_WORDS = new Set([
  'dumbbell',
  'dumbbells',
  'barbell',
  'cable',
  'machine',
  'seated',
  'standing',
  'single',
  'arm',
  'leg',
  'with',
  'the',
  'and',
]);

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word));

const significantWords = (name: string): string[] => {
  const words = wordsOf(name).filter((word) => !GENERIC_WORDS.has(word));
  return words.length > 0 ? words : wordsOf(name);
};

export interface ExerciseMentionContext {
  current: string;
  wrong: string[];
  others: string[];
}

export const exerciseMentionContext = (state: any): ExerciseMentionContext | null => {
  const exercises: { name?: unknown }[] = Array.isArray(state?.exercises) ? state.exercises : [];
  const index = Number(state?.currentExerciseIndex ?? 0);
  const current = typeof exercises[index]?.name === 'string' ? (exercises[index].name as string) : null;
  if (!current || state?.target?.type !== 'strength' || state?.ended) return null;
  const names = exercises.map((e) => (typeof e?.name === 'string' ? (e.name as string) : '')).filter(Boolean);
  const wrong = names.slice(index + 1).filter((name) => name !== current);
  const others = names.filter((name, i) => i !== index && name !== current);
  return { current, wrong, others };
};

export const namesWrongExercise = (sentence: string, ctx: ExerciseMentionContext | null): boolean => {
  if (!ctx || ctx.wrong.length === 0) return false;
  const words = new Set(wordsOf(sentence));
  if (mentionsCurrentExercise(sentence, ctx)) return false;
  return ctx.wrong.some((name) => significantWords(name).every((word) => words.has(word)));
};

export const mentionsCurrentExercise = (text: string, ctx: ExerciseMentionContext): boolean => {
  const words = new Set(wordsOf(text));
  const shared = new Set(ctx.others.flatMap(significantWords));
  const own = significantWords(ctx.current);
  const distinctive = own.filter((word) => !shared.has(word));
  return (distinctive.length > 0 ? distinctive : own).some((word) => words.has(word));
};
