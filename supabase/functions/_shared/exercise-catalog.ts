// Starter exercise catalog. `contraindicatedFor` tags use the same vocabulary the injury
// validator checks (see injury-validator.ts). This seeds the `exercise` table and gives the
// brain a safe vocabulary to build plans from.
//
// NOTE: tags are a reasonable first pass, NOT a clinical S&C review — flag for a coach/PT to
// vet before launch. The validator only enforces what's tagged here, so accuracy matters.

export interface CatalogExercise {
  name: string;
  movementPattern: string;
  primaryMuscles: string[];
  contraindicatedFor: string[];
}

export const EXERCISE_CATALOG: CatalogExercise[] = [
  // Lower — squat pattern (knee + axial load)
  { name: 'Back Squat',   movementPattern: 'squat', primaryMuscles: ['quads', 'glutes'], contraindicatedFor: ['deep_knee_flexion_loaded', 'heavy_axial_load'] },
  { name: 'Front Squat',  movementPattern: 'squat', primaryMuscles: ['quads'],           contraindicatedFor: ['deep_knee_flexion_loaded', 'heavy_axial_load'] },
  { name: 'Leg Press',    movementPattern: 'squat', primaryMuscles: ['quads', 'glutes'], contraindicatedFor: ['deep_knee_flexion_loaded'] },
  { name: 'Leg Extension',movementPattern: 'squat', primaryMuscles: ['quads'],           contraindicatedFor: ['deep_knee_flexion_loaded'] },
  { name: 'Box Jump',     movementPattern: 'plyo',  primaryMuscles: ['quads', 'glutes'], contraindicatedFor: ['high_impact', 'deep_knee_flexion_loaded'] },

  // Lower — hinge pattern (spinal load)
  { name: 'Deadlift',           movementPattern: 'hinge', primaryMuscles: ['glutes', 'hamstrings', 'back'], contraindicatedFor: ['heavy_axial_load', 'loaded_spinal_flexion'] },
  { name: 'Romanian Deadlift',  movementPattern: 'hinge', primaryMuscles: ['hamstrings', 'glutes'],         contraindicatedFor: ['loaded_spinal_flexion', 'heavy_axial_load'] },

  // Lower — knee/back friendly alternatives
  { name: 'Hip Thrust',   movementPattern: 'hinge', primaryMuscles: ['glutes'],      contraindicatedFor: [] },
  { name: 'Leg Curl',     movementPattern: 'isolation', primaryMuscles: ['hamstrings'], contraindicatedFor: [] },
  { name: 'Glute Bridge', movementPattern: 'hinge', primaryMuscles: ['glutes'],      contraindicatedFor: [] },

  // Upper — push
  { name: 'Overhead Press',        movementPattern: 'push', primaryMuscles: ['shoulders'], contraindicatedFor: ['overhead_press'] },
  { name: 'Bench Press',           movementPattern: 'push', primaryMuscles: ['chest'],     contraindicatedFor: ['heavy_horizontal_press'] },
  { name: 'Incline Dumbbell Press',movementPattern: 'push', primaryMuscles: ['chest'],     contraindicatedFor: ['heavy_horizontal_press'] },
  { name: 'Push-up',               movementPattern: 'push', primaryMuscles: ['chest'],     contraindicatedFor: [] },

  // Upper — pull (generally joint-friendly)
  { name: 'Lat Pulldown', movementPattern: 'pull', primaryMuscles: ['lats'],   contraindicatedFor: [] },
  { name: 'Seated Row',   movementPattern: 'pull', primaryMuscles: ['back'],   contraindicatedFor: [] },
  { name: 'Face Pull',    movementPattern: 'pull', primaryMuscles: ['rear_delts'], contraindicatedFor: [] },

  // Core
  { name: 'Plank',       movementPattern: 'core', primaryMuscles: ['core'], contraindicatedFor: [] },
  { name: 'Dead Bug',    movementPattern: 'core', primaryMuscles: ['core'], contraindicatedFor: [] },
];

export function findExercise(name: string): CatalogExercise | undefined {
  return EXERCISE_CATALOG.find(e => e.name.toLowerCase() === name.toLowerCase());
}
