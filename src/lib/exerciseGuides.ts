import type { ExerciseMotion } from '../components/ExerciseMotionIllustration';

/**
 * Factual, exercise-level reference content for the Guide sheet — what the movement is, what it
 * works, how to set up and execute it. Distinct from anything personal: the coach's own past
 * notes and the user's logged history are separate, per-user data.
 *
 * Held locally rather than in the database or generated on demand: this is stable reference
 * material for a fixed 19-exercise catalog (see supabase/functions/_shared/exercise-catalog.ts),
 * so a local table costs nothing, renders instantly with no loading state, and can't drift
 * between runs the way generated copy would. Keys must match the catalog's names exactly — the
 * lookup below normalizes case, but not spelling.
 */
export interface ExerciseReference {
  summary: string;
  muscles: string[];
  setup: string[];
  execution: string[];
  motion: ExerciseMotion;
}

export const EXERCISE_REFERENCE: Record<string, ExerciseReference> = {
  'Back Squat': {
    summary:
      'A compound lower-body lift — you descend by bending at the hips and knees with a barbell across your upper back, then drive back up to standing. It\'s the foundation movement for building leg and posterior-chain strength.',
    muscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core'],
    setup: [
      'Set the bar in the rack at roughly chest height and step under it, resting it across your upper traps.',
      'Unrack with your feet under the bar, then step back to a stance just outside shoulder-width, toes turned slightly out.',
      'Brace your core and take a full breath before you start descending.',
    ],
    execution: [
      'Push your hips back and bend your knees together, keeping your chest up and the bar tracking over your midfoot.',
      'Descend until your hip crease drops below your knee, or as deep as your mobility allows with good form.',
      'Drive through your whole foot to stand back up, keeping your knees tracking in line with your toes.',
      'Exhale near the top of the rep, then reset your brace before the next one.',
    ],
    motion: 'squat',
  },

  'Front Squat': {
    summary:
      'A squat variation with the barbell racked across the front of your shoulders. The upright torso it forces shifts the work toward your quads and demands more from your core than a back squat.',
    muscles: ['Quadriceps', 'Core', 'Upper Back'],
    setup: [
      'Rack the bar across your front delts, fingertips under it just outside your shoulders.',
      'Drive your elbows up so your upper arms are close to parallel with the floor — that shelf is what holds the bar.',
      'Stand shoulder-width with your toes slightly out and brace hard.',
    ],
    execution: [
      'Sit straight down, keeping your torso as vertical as you can and your elbows high.',
      'Descend until your thighs are at least parallel, without letting your chest drop forward.',
      'Drive up through your midfoot, keeping the bar stacked over your shoulders the whole way.',
    ],
    motion: 'squat',
  },

  'Leg Press': {
    summary:
      'A machine-based pressing movement for the legs — you push a loaded platform away by extending your hips and knees. The supported back position lets you load your quads and glutes hard with very little demand on your spine.',
    muscles: ['Quadriceps', 'Glutes'],
    setup: [
      'Sit with your back and hips flat against the pad, no gap at your lower back.',
      'Place your feet shoulder-width on the platform, roughly mid-height, toes slightly out.',
      'Release the safety catches and take the weight with your legs almost straight.',
    ],
    execution: [
      'Lower the platform under control until your knees reach about 90 degrees.',
      'Stop before your lower back starts to round or lift off the pad — that\'s your depth limit.',
      'Press back up through your whole foot, stopping just short of locking your knees out.',
    ],
    motion: 'seated',
  },

  'Leg Extension': {
    summary:
      'A seated isolation movement for the quadriceps — you straighten your knees against a padded lever. Because it isolates one joint, it\'s a direct way to add quad volume without loading your hips or spine.',
    muscles: ['Quadriceps'],
    setup: [
      'Sit back in the seat with your knees lined up with the machine\'s pivot point.',
      'Set the ankle pad so it rests just above your feet, on your lower shins.',
      'Hold the handles and keep your hips pinned to the seat.',
    ],
    execution: [
      'Straighten your knees smoothly until your legs are almost fully extended.',
      'Pause briefly at the top and squeeze your quads rather than snapping into the lockout.',
      'Lower under control, resisting the weight the whole way down.',
    ],
    motion: 'seated',
  },

  'Box Jump': {
    summary:
      'An explosive lower-body movement — you jump from the floor onto a raised box and land softly. It trains rate of force development rather than maximum strength, so quality of each jump matters more than volume.',
    muscles: ['Quadriceps', 'Glutes', 'Calves'],
    setup: [
      'Stand a short step back from a box you can clear comfortably — height is not the point.',
      'Set your feet hip-width apart with your arms free to swing.',
      'Dip into a quarter squat and swing your arms back to load the jump.',
    ],
    execution: [
      'Drive through the floor and extend your hips, knees and ankles all at once, swinging your arms up.',
      'Land softly in the middle of the box with both feet flat and knees bent to absorb the impact.',
      'Step down one foot at a time rather than jumping down, and reset fully before the next rep.',
    ],
    motion: 'squat',
  },

  Deadlift: {
    summary:
      'A hip-hinge lift where you pull a loaded barbell from the floor to standing. It trains almost the whole posterior chain at once and is one of the highest-load movements you can do, so bracing and back position matter more here than anywhere else.',
    muscles: ['Glutes', 'Hamstrings', 'Back', 'Core'],
    setup: [
      'Stand with the bar over your midfoot, feet about hip-width apart.',
      'Push your hips back and grip the bar just outside your shins.',
      'Pull your chest up and your shoulders down to set a flat back, then take the slack out of the bar before you pull.',
    ],
    execution: [
      'Push the floor away with your legs, keeping the bar in contact with your shins as it rises.',
      'Once the bar passes your knees, drive your hips forward to finish standing tall.',
      'Keep your back in the same position throughout — the bar path should be a straight vertical line.',
      'Lower by hinging your hips back first, then bending your knees once the bar clears them.',
    ],
    motion: 'hinge',
  },

  'Romanian Deadlift': {
    summary:
      'A hip-hinge movement performed from standing with only a slight knee bend, lowering the bar down your legs. Keeping the knees mostly fixed puts the stretch and the work squarely on your hamstrings and glutes.',
    muscles: ['Hamstrings', 'Glutes', 'Back'],
    setup: [
      'Stand holding the bar at your hips, feet hip-width apart.',
      'Unlock your knees slightly and keep them at that angle for the whole set.',
      'Pull your shoulders back and brace your core.',
    ],
    execution: [
      'Push your hips back and let the bar travel down along your thighs.',
      'Stop when you feel a strong stretch in your hamstrings, usually around mid-shin — depth comes from your hips, not your back.',
      'Drive your hips forward to stand back up, squeezing your glutes at the top.',
    ],
    motion: 'hinge',
  },

  'Hip Thrust': {
    summary:
      'A glute-focused hinge with your upper back on a bench and a barbell across your hips. The horizontal loading makes it one of the most direct ways to train the glutes without much demand on your knees or lower back.',
    muscles: ['Glutes', 'Hamstrings'],
    setup: [
      'Sit on the floor with your upper back against a bench and roll the bar over your hips, using a pad.',
      'Plant your feet flat, roughly shoulder-width, so your shins are vertical at the top of the rep.',
      'Tuck your chin slightly and brace your core.',
    ],
    execution: [
      'Push through your heels and drive your hips up until your torso and thighs form a straight line.',
      'Squeeze your glutes hard at the top — avoid arching your lower back to get higher.',
      'Lower under control until your hips are just off the floor, then go straight into the next rep.',
    ],
    motion: 'hinge',
  },

  'Leg Curl': {
    summary:
      'An isolation movement for the hamstrings — you bend your knees against a padded lever. It trains the hamstrings at the knee joint, which hip-hinge lifts like the Romanian deadlift barely reach.',
    muscles: ['Hamstrings', 'Calves'],
    setup: [
      'Position yourself in the machine with your knees just past the edge of the pad.',
      'Set the ankle pad so it sits just above your heels.',
      'Hold the handles and keep your hips pressed down throughout.',
    ],
    execution: [
      'Curl your heels toward your glutes as far as the machine allows.',
      'Squeeze at the top without letting your hips lift off the pad.',
      'Lower slowly and resist the weight rather than letting it drop back.',
    ],
    motion: 'seated',
  },

  'Glute Bridge': {
    summary:
      'A bodyweight or lightly-loaded hinge done lying on the floor, lifting your hips until your body forms a straight line. It\'s a low-skill, low-load way to train the glutes, and a common starting point when hip thrusts or deadlifts aren\'t appropriate yet.',
    muscles: ['Glutes', 'Hamstrings', 'Core'],
    setup: [
      'Lie on your back with your knees bent and your feet flat, close to your glutes.',
      'Set your feet hip-width apart and rest your arms at your sides.',
      'Flatten your lower back into the floor to brace.',
    ],
    execution: [
      'Push through your heels and lift your hips until your knees, hips and shoulders line up.',
      'Squeeze your glutes at the top for a beat.',
      'Lower until your hips just touch the floor, then repeat without resting.',
    ],
    motion: 'hinge',
  },

  'Overhead Press': {
    summary:
      'A standing vertical press — you drive a barbell from your shoulders to overhead. It builds shoulder and triceps strength, and because you press from your feet the whole body has to stay tight to keep you stable.',
    muscles: ['Shoulders', 'Triceps', 'Core'],
    setup: [
      'Hold the bar at shoulder height with your hands just outside your shoulders, elbows slightly in front of the bar.',
      'Stand with your feet hip-width apart and squeeze your glutes to stop your lower back arching.',
      'Brace your core and tuck your chin so the bar has a clear path past your face.',
    ],
    execution: [
      'Press the bar straight up, moving your head back slightly as it passes your forehead.',
      'Finish with the bar over the middle of your feet, arms locked and shoulders shrugged up.',
      'Lower under control back to your shoulders and reset your brace before the next rep.',
    ],
    motion: 'overhead',
  },

  'Bench Press': {
    summary:
      'A compound upper-body press performed lying on a bench — you lower a barbell to your chest, then press it back up. It\'s the main horizontal-pressing movement for chest, shoulder and triceps strength.',
    muscles: ['Chest', 'Front Delts', 'Triceps'],
    setup: [
      'Lie back with your eyes roughly under the bar and your feet flat on the floor.',
      'Grip the bar a little wider than shoulder-width, then pull your shoulder blades back and down into the bench.',
      'Unrack to arms straight over your shoulders and take a breath before you lower.',
    ],
    execution: [
      'Lower the bar under control to your mid-chest, tucking your elbows to around 45 degrees from your body.',
      'Touch your chest lightly rather than bouncing the bar off it.',
      'Press back up and slightly toward your face, finishing over your shoulders.',
      'Keep your shoulder blades pinned and your feet planted for every rep.',
    ],
    motion: 'press',
  },

  'Incline Dumbbell Press': {
    summary:
      'A pressing movement on an inclined bench using dumbbells. The angle biases the upper chest and front delts, and the independent dumbbells let each arm move through its own natural path.',
    muscles: ['Upper Chest', 'Front Delts', 'Triceps'],
    setup: [
      'Set the bench to roughly 30–45 degrees and sit back with a dumbbell in each hand.',
      'Kick the dumbbells up to shoulder height as you lie back, palms facing forward.',
      'Pull your shoulder blades back into the bench and plant your feet.',
    ],
    execution: [
      'Lower the dumbbells to the sides of your upper chest, elbows at about 45 degrees.',
      'Stop when your upper arms are roughly level with your torso — going deeper strains the shoulder.',
      'Press up and slightly together, stopping just short of the dumbbells touching.',
    ],
    motion: 'press',
  },

  'Push-up': {
    summary:
      'A bodyweight horizontal press from a plank position. It trains the same muscles as a bench press while also demanding core and shoulder stability, and needs no equipment at all.',
    muscles: ['Chest', 'Front Delts', 'Triceps', 'Core'],
    setup: [
      'Set your hands slightly wider than shoulder-width, under your upper chest.',
      'Extend your legs back so your body forms a straight line from head to heels.',
      'Squeeze your glutes and brace your core so your hips neither sag nor pike up.',
    ],
    execution: [
      'Lower your chest toward the floor, keeping your elbows at about 45 degrees from your body.',
      'Descend until your chest is an inch or two off the floor.',
      'Press back up as one rigid unit, finishing with your elbows straight.',
    ],
    motion: 'plank',
  },

  'Lat Pulldown': {
    summary:
      'A vertical pulling movement on a cable machine — you pull a bar down to your upper chest from overhead. It\'s the main back-width builder for anyone not yet strong enough to train pull-ups directly.',
    muscles: ['Lats', 'Upper Back', 'Biceps'],
    setup: [
      'Set the thigh pad so you\'re held firmly in the seat, and grip the bar wider than shoulder-width.',
      'Sit tall with your chest up and a slight lean back from the hips.',
      'Let your arms straighten fully so your lats are stretched before the first rep.',
    ],
    execution: [
      'Pull your elbows down and back, bringing the bar toward your upper chest.',
      'Lead with your elbows rather than your hands, and think about squeezing your shoulder blades together.',
      'Control the bar back up to full arm extension without letting your shoulders shrug up.',
    ],
    motion: 'pull',
  },

  'Seated Row': {
    summary:
      'A horizontal pulling movement — you pull a handle toward your torso while seated. It builds mid-back thickness and directly balances the pressing work in most programmes.',
    muscles: ['Back', 'Rear Delts', 'Biceps'],
    setup: [
      'Sit with your feet braced and a slight bend in your knees.',
      'Grip the handle and sit tall, chest up, arms extended.',
      'Set your shoulders down and back before you pull.',
    ],
    execution: [
      'Pull the handle toward your lower ribs, driving your elbows past your torso.',
      'Squeeze your shoulder blades together at the end of the pull.',
      'Extend your arms back out under control, keeping your torso upright rather than rocking with the weight.',
    ],
    motion: 'pull',
  },

  'Face Pull': {
    summary:
      'A high cable pull toward your face with elbows flared, targeting the rear delts and upper back. It\'s a small movement done for shoulder health as much as size — the muscles it hits are the ones most pressing work neglects.',
    muscles: ['Rear Delts', 'Upper Back', 'Rotator Cuff'],
    setup: [
      'Set a rope attachment at roughly face height and take one end in each hand, thumbs pointing back.',
      'Step back until the cable is under tension with your arms extended.',
      'Stand tall with a braced core and a slight lean back.',
    ],
    execution: [
      'Pull the rope toward your face, flaring your elbows out and up.',
      'Finish with your hands beside your ears and your shoulder blades squeezed together.',
      'Return slowly under control — keep the weight light enough that your traps don\'t take over.',
    ],
    motion: 'pull',
  },

  Plank: {
    summary:
      'An isometric core hold in a straight line from head to heels, supported on your forearms and toes. It trains the core to resist movement rather than create it, which is exactly what it does during heavy squats and deadlifts.',
    muscles: ['Core', 'Shoulders', 'Glutes'],
    setup: [
      'Set your forearms on the floor with your elbows directly under your shoulders.',
      'Extend your legs back onto your toes, feet about hip-width apart.',
      'Line your head, hips and heels up in one straight line.',
    ],
    execution: [
      'Brace your core hard and squeeze your glutes to stop your hips sagging.',
      'Keep breathing steadily — hold your position, not your breath.',
      'End the set when your hips start to drop or rise rather than pushing to failure.',
    ],
    motion: 'plank',
  },

  'Dead Bug': {
    summary:
      'A core exercise done on your back, extending one arm and the opposite leg while keeping your lower back flat. It trains anti-extension control with almost no spinal loading, which makes it a common choice around back issues.',
    muscles: ['Core', 'Hip Flexors'],
    setup: [
      'Lie on your back with your arms straight up and your knees bent above your hips.',
      'Press your lower back flat into the floor and hold it there.',
      'Exhale to set your ribs down before the first rep.',
    ],
    execution: [
      'Slowly lower one arm overhead and straighten the opposite leg toward the floor.',
      'Stop the moment your lower back starts to arch — that\'s your range.',
      'Return to the start under control and repeat on the other side.',
    ],
    motion: 'plank',
  },
};

/** Case-insensitive lookup — display names reach this from several places (plan rows, the
 *  Active Session header) with inconsistent casing. */
export function getExerciseReference(name: string | null | undefined): ExerciseReference | null {
  if (!name) return null;
  const target = name.trim().toLowerCase();
  const match = Object.keys(EXERCISE_REFERENCE).find((key) => key.toLowerCase() === target);
  return match ? EXERCISE_REFERENCE[match] : null;
}
