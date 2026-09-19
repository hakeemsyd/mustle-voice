export const EXERCISE_NAMES: string[] = [
  'Back Squat',
  'Front Squat',
  'Leg Press',
  'Leg Extension',
  'Box Jump',
  'Deadlift',
  'Romanian Deadlift',
  'Hip Thrust',
  'Leg Curl',
  'Glute Bridge',
  'Overhead Press',
  'Bench Press',
  'Incline Dumbbell Press',
  'Push-up',
  'Lat Pulldown',
  'Seated Row',
  'Face Pull',
  'Pull-up',
  'Dumbbell Row',
  'Barbell Curl',
  'Dumbbell Curl',
  'Hammer Curl',
  'Cable Tricep Pushdown',
  'Overhead Tricep Extension',
  'Tricep Dip',
  'Lateral Raise',
  'Calf Raise',
  'Plank',
  'Dead Bug',
  'Hanging Knee Raise',
];

export const BODYWEIGHT_EXERCISE_NAMES = new Set([
  'Push-up',
  'Pull-up',
  'Tricep Dip',
  'Plank',
  'Dead Bug',
  'Hanging Knee Raise',
  'Glute Bridge',
  'Box Jump',
]);

export const isBodyweightExercise = (name: string | null | undefined): boolean =>
  !!name && BODYWEIGHT_EXERCISE_NAMES.has(name.trim());

export const isBodyweightWork = (
  name: string | null | undefined,
  loadScheme: string | null | undefined,
): boolean => loadScheme?.trim().toLowerCase() === 'bodyweight' || isBodyweightExercise(name);

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patternFor = (name: string): RegExp =>
  new RegExp(`\\b${name.split(/[\s-]+/).map(escapeForRegex).join('[\\s-]?')}(e?s)?\\b`, 'gi');

const CANONICAL_PATTERNS: { name: string; pattern: RegExp }[] = EXERCISE_NAMES.slice()
  .sort((a, b) => b.length - a.length)
  .map((name) => ({ name, pattern: patternFor(name) }));

export const canonicalizeExerciseNames = (text: string): string =>
  CANONICAL_PATTERNS.reduce(
    (out, { name, pattern }) => out.replace(pattern, (_match, plural) => `${name}${plural ?? ''}`),
    text,
  );
