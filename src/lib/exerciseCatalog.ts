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
  'Incline Dumbbell Curl',
  'Preacher Curl',
  'Cable Curl',
  'Concentration Curl',
  'Reverse Curl',
  'Tricep Kickback',
  'Skull Crusher',
  'Close-Grip Bench Press',
  'Dumbbell Bench Press',
  'Incline Barbell Press',
  'Chest Fly',
  'Cable Crossover',
  'Dumbbell Shoulder Press',
  'Arnold Press',
  'Front Raise',
  'Rear Delt Fly',
  'Upright Row',
  'Shrug',
  'Barbell Row',
  'T-Bar Row',
  'Chest-Supported Row',
  'Chin-up',
  'Straight-Arm Pulldown',
  'Goblet Squat',
  'Hack Squat',
  'Bulgarian Split Squat',
  'Walking Lunge',
  'Step-up',
  'Sumo Deadlift',
  'Trap Bar Deadlift',
  'Single-Leg Romanian Deadlift',
  'Good Morning',
  'Back Extension',
  'Cable Glute Kickback',
  'Hip Abduction',
  'Seated Calf Raise',
  'Side Plank',
  'Russian Twist',
  'Cable Crunch',
  'Bicycle Crunch',
  "Farmer's Carry",
  'Zone 2 Cardio',
  'Treadmill Incline Walk',
  'Stationary Bike',
  'Rowing Machine',
  'Elliptical',
  'Stair Climber',
  'Jump Rope',
  'Running',
];

export const BODYWEIGHT_EXERCISE_NAMES = new Set([
  'Push-up',
  'Pull-up',
  'Chin-up',
  'Tricep Dip',
  'Plank',
  'Side Plank',
  'Dead Bug',
  'Bicycle Crunch',
  'Hanging Knee Raise',
  'Glute Bridge',
  'Box Jump',
]);

export const TIMED_EXERCISE_NAMES = new Set([
  'Zone 2 Cardio',
  'Treadmill Incline Walk',
  'Stationary Bike',
  'Rowing Machine',
  'Elliptical',
  'Stair Climber',
  'Jump Rope',
  'Running',
  'Plank',
  'Side Plank',
  "Farmer's Carry",
]);

export const CARDIO_EXERCISE_NAMES = new Set([
  'Zone 2 Cardio',
  'Treadmill Incline Walk',
  'Stationary Bike',
  'Rowing Machine',
  'Elliptical',
  'Stair Climber',
  'Jump Rope',
  'Running',
]);

export const isBodyweightExercise = (name: string | null | undefined): boolean =>
  !!name && BODYWEIGHT_EXERCISE_NAMES.has(name.trim());

export const isTimedExercise = (name: string | null | undefined): boolean =>
  !!name && TIMED_EXERCISE_NAMES.has(name.trim());

export const isCardioExercise = (name: string | null | undefined): boolean =>
  !!name && CARDIO_EXERCISE_NAMES.has(name.trim());

export const isBodyweightWork = (
  name: string | null | undefined,
  loadScheme: string | null | undefined,
): boolean => loadScheme?.trim().toLowerCase() === 'bodyweight' || isBodyweightExercise(name);

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const patternFor = (name: string): RegExp =>
  new RegExp(`\\b${name.split(/[\s-]+/).map(escapeForRegex).join('[\\s-]?')}(e?s)?\\b`, 'gi');

const AMBIGUOUS_IN_PROSE = new Set([
  'Running',
  'Shrug',
  'Elliptical',
  'Step-up',
  'Chin-up',
  'Good Morning',
]);

const CANONICAL_PATTERNS: { name: string; pattern: RegExp }[] = EXERCISE_NAMES.slice()
  .filter((name) => !AMBIGUOUS_IN_PROSE.has(name))
  .sort((a, b) => b.length - a.length)
  .map((name) => ({ name, pattern: patternFor(name) }));

export const canonicalizeExerciseNames = (text: string): string =>
  CANONICAL_PATTERNS.reduce(
    (out, { name, pattern }) => out.replace(pattern, (_match, plural) => `${name}${plural ?? ''}`),
    text,
  );
