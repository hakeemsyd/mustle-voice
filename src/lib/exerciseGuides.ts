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
  motion?: ExerciseMotion;
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

  'Sumo Deadlift': {
    summary:
      'A deadlift with a wide stance and hands inside your knees. The shorter range and more upright torso shift work toward your glutes, quads and inner thighs, and it often suits taller lifters better than the conventional pull.',
    muscles: ['Glutes', 'Quadriceps', 'Adductors', 'Back'],
    setup: [
      'Take a wide stance with your toes turned out, shins close to the bar.',
      'Grip inside your legs with straight arms, hands about shoulder-width.',
      'Drop your hips, pull your chest up and push your knees out toward your toes.',
    ],
    execution: [
      'Drive your feet out into the floor rather than straight down, keeping your knees tracking over your toes.',
      'Keep the bar in contact with your legs the whole way up.',
      'Finish standing tall with your hips fully extended.',
      'Lower under control along the same path, hips back and knees out.',
    ],
    motion: 'hinge',
  },

  'Trap Bar Deadlift': {
    summary:
      'A deadlift performed inside a hexagonal bar, so the load sits beside you rather than in front. That keeps your torso more upright and your lower back under less shear than a straight-bar pull, which makes it a common first heavy lift to teach.',
    muscles: ['Glutes', 'Quadriceps', 'Back', 'Grip'],
    setup: [
      'Step into the middle of the bar with your feet hip-width apart.',
      'Hinge down and take the handles at your sides, arms straight.',
      'Drop your hips slightly, chest up, and brace before you pull.',
    ],
    execution: [
      'Push through your whole foot and stand up, keeping the handles tracking straight beside you.',
      'Finish tall with your hips through and shoulders back.',
      'Push your hips back to lower, keeping the bar close to your body line.',
      'Let the weight settle on the floor and reset your brace between reps.',
    ],
    motion: 'hinge',
  },

  'Single-Leg Romanian Deadlift': {
    summary:
      'A one-legged hinge that loads the hamstring and glute of the standing leg while demanding real balance. Useful for finding and fixing a side-to-side strength difference that a two-legged lift hides.',
    muscles: ['Hamstrings', 'Glutes', 'Core'],
    setup: [
      'Stand on one leg with a soft bend in that knee, weight in the opposite hand.',
      'Set your shoulders back and brace your core.',
      'Fix your eyes on a point on the floor a couple of steps ahead.',
    ],
    execution: [
      'Push your hips back and let your free leg travel behind you as a counterweight.',
      'Lower until you feel a strong stretch in the standing hamstring, keeping your hips square to the floor.',
      'Drive your hips forward to return to standing without letting the free foot touch down.',
      'Finish all reps on one side before switching.',
    ],
    motion: 'hinge',
  },

  'Good Morning': {
    summary:
      'A hinge with the bar on your back — you bow forward at the hips and return. It loads the hamstrings and spinal erectors hard through a long range, so it is trained light and controlled rather than heavy.',
    muscles: ['Hamstrings', 'Glutes', 'Lower Back'],
    setup: [
      'Rack the bar across your upper back as you would for a squat and step out.',
      'Stand hip- to shoulder-width with a soft bend in your knees.',
      'Brace your core hard and set your shoulder blades back.',
    ],
    execution: [
      'Push your hips straight back and let your torso travel forward, keeping your back flat.',
      'Stop when your torso is around parallel to the floor, or earlier if your back starts to round.',
      'Drive your hips forward to stand back up.',
      'Keep the movement slow — this is not a lift to rush or bounce.',
    ],
    motion: 'hinge',
  },

  'Back Extension': {
    summary:
      'An isolation movement for the muscles that run along your spine and your glutes, performed on a 45-degree or horizontal bench. Trained for control and endurance rather than heavy load.',
    muscles: ['Lower Back', 'Glutes', 'Hamstrings'],
    setup: [
      'Set the pad just below your hip bones so your hips can bend freely.',
      'Hook your heels under the rollers and cross your arms over your chest.',
      'Start with your torso in a straight line from head to heels.',
    ],
    execution: [
      'Lower your torso by bending at the hips, keeping your back flat rather than rounding.',
      'Go down until you feel a stretch in your hamstrings.',
      'Squeeze your glutes to raise back to a straight line — do not arch past it.',
      'Move slowly; momentum takes the work off the muscles you are training.',
    ],
    motion: 'hinge',
  },

  'Goblet Squat': {
    summary:
      'A squat holding a single dumbbell or kettlebell at your chest. The front load naturally keeps your torso upright, which makes it the easiest squat variation to learn good depth and position with.',
    muscles: ['Quadriceps', 'Glutes', 'Core'],
    setup: [
      'Hold the weight vertically against your chest, elbows tucked underneath it.',
      'Stand shoulder-width with your toes turned slightly out.',
      'Brace your core and pull your shoulders back.',
    ],
    execution: [
      'Sit straight down between your feet, keeping your chest tall and the weight against you.',
      'Let your elbows travel inside your knees at the bottom and push your knees out against them.',
      'Drive through your whole foot to stand back up.',
      'Keep your heels flat throughout — if they lift, reduce your depth.',
    ],
    motion: 'squat',
  },

  'Hack Squat': {
    summary:
      'A machine squat with your back supported against an angled pad. The fixed path removes the balance demand and lets you push the quads close to failure more safely than a free-weight squat.',
    muscles: ['Quadriceps', 'Glutes'],
    setup: [
      'Set your back and shoulders firmly against the pads.',
      'Place your feet shoulder-width on the platform, roughly under your hips.',
      'Release the safety handles and take the weight.',
    ],
    execution: [
      'Lower under control until your knees reach about 90 degrees, or deeper if it stays comfortable.',
      'Keep your whole back in contact with the pad — do not let your hips roll off at the bottom.',
      'Drive through your whole foot to press back up, stopping just short of locking your knees.',
      'Re-engage the safeties before you step out.',
    ],
    motion: 'squat',
  },

  'Bulgarian Split Squat': {
    summary:
      'A single-leg squat with your rear foot elevated behind you. One of the most effective builders of leg strength and balance, and brutally honest about side-to-side differences.',
    muscles: ['Quadriceps', 'Glutes', 'Core'],
    setup: [
      'Place the top of your rear foot on a bench or box roughly knee height.',
      'Step your front foot far enough forward that your knee stays over your midfoot at the bottom.',
      'Stand tall with a slight forward lean and brace.',
    ],
    execution: [
      'Lower straight down until your rear knee is close to the floor.',
      'Keep your weight in the front foot — the back leg is for balance, not for pushing.',
      'Drive through your front heel to stand back up.',
      'Complete all reps on one leg before switching.',
    ],
    motion: 'squat',
  },

  'Walking Lunge': {
    summary:
      'A travelling single-leg movement — you step forward, lower into a lunge, then bring the back leg through into the next rep. It trains legs, balance and hip stability together.',
    muscles: ['Quadriceps', 'Glutes', 'Hamstrings', 'Core'],
    setup: [
      'Hold dumbbells at your sides or a bar on your back, and find a clear stretch of floor.',
      'Stand tall with your feet hip-width apart.',
      'Brace your core and look straight ahead.',
    ],
    execution: [
      'Step forward far enough that both knees can reach about 90 degrees.',
      'Lower until your back knee is just above the floor, keeping your torso upright.',
      'Drive through your front heel and bring your back foot through into the next step.',
      'Keep your steps in a straight line rather than crossing over.',
    ],
    motion: 'squat',
  },

  'Step-up': {
    summary:
      'You drive up onto a box or bench with one leg. Simple, scalable, and directly transferable to stairs and hills — the height of the step sets the difficulty.',
    muscles: ['Quadriceps', 'Glutes', 'Hamstrings'],
    setup: [
      'Set a box at a height where your working thigh is roughly parallel to the floor when your foot is on it.',
      'Hold dumbbells at your sides.',
      'Place one whole foot on the box, heel included.',
    ],
    execution: [
      'Drive through the foot on the box to stand up on it, keeping the trailing leg passive.',
      'Stand tall at the top without pushing off the floor with the back foot.',
      'Lower under control to a soft landing rather than dropping.',
      'Finish all reps on one leg, then switch.',
    ],
    motion: 'squat',
  },

  'Cable Glute Kickback': {
    summary:
      'A cable isolation for the glutes — you drive one leg back against the resistance. Trained for a strong contraction and controlled range, not heavy load.',
    muscles: ['Glutes'],
    setup: [
      'Attach an ankle cuff to a low pulley and fasten it above one ankle.',
      'Face the machine and hold the frame for balance.',
      'Stand tall with a soft bend in the supporting knee and brace your core.',
    ],
    execution: [
      'Drive the working leg straight back and slightly up, squeezing the glute.',
      'Stop before your lower back starts to arch — the range is smaller than most people expect.',
      'Return slowly to the start against the cable, keeping tension on the muscle.',
      'Complete all reps on one side before switching.',
    ],
  },

  'Hip Abduction': {
    summary:
      'A machine movement that works the muscles on the outside of your hips by pushing your knees apart against resistance. Useful for hip stability and a common accessory for knee health.',
    muscles: ['Glutes', 'Hip Abductors'],
    setup: [
      'Sit with your back against the pad and your knees against the inside of the pads.',
      'Select a weight you can control without the plates crashing.',
      'Sit tall rather than slumped.',
    ],
    execution: [
      'Push your knees apart smoothly to the end of a comfortable range.',
      'Pause briefly at the widest point and squeeze.',
      'Return slowly under control instead of letting the weight snap you back.',
      'Keep your torso still — do not lean back to force more range.',
    ],
    motion: 'seated',
  },

  'Seated Calf Raise': {
    summary:
      'A calf raise with your knees bent, which biases the soleus — the deeper calf muscle that straight-legged raises work less. Responds well to slow reps and a full stretch.',
    muscles: ['Calves'],
    setup: [
      'Sit with the pad across your lower thighs, just above your knees.',
      'Place the balls of your feet on the platform with your heels hanging free.',
      'Release the safety and take the load.',
    ],
    execution: [
      'Let your heels drop as far as comfortable to get a full stretch.',
      'Press up onto the balls of your feet as high as you can and hold for a beat.',
      'Lower slowly — this movement is almost entirely ruined by bouncing.',
      'Keep the range full on every rep rather than shortening as you fatigue.',
    ],
    motion: 'seated',
  },

  'Calf Raise': {
    summary:
      'A standing raise onto the balls of your feet against load. With the knee straight it emphasises the gastrocnemius, the calf muscle you can actually see.',
    muscles: ['Calves'],
    setup: [
      'Stand with the balls of your feet on a step or platform, heels hanging off.',
      'Hold dumbbells at your sides or use a machine\'s shoulder pads.',
      'Stand tall with your legs straight but knees unlocked.',
    ],
    execution: [
      'Drop your heels below the platform for a full stretch.',
      'Press up as high onto your toes as you can and pause at the top.',
      'Lower slowly under control.',
      'Keep your body still — all the movement happens at the ankle.',
    ],
  },

  'Dumbbell Bench Press': {
    summary:
      'A horizontal press with a dumbbell in each hand. The independent weights allow a longer range at the bottom and a more natural shoulder path than a barbell, and they expose any strength difference between sides.',
    muscles: ['Chest', 'Triceps', 'Front Delts'],
    setup: [
      'Sit on the end of a flat bench with the dumbbells on your thighs.',
      'Lie back, using your knees to kick the weights into position over your chest.',
      'Set your feet flat, squeeze your shoulder blades together and keep them pinned.',
    ],
    execution: [
      'Lower the dumbbells to roughly chest level, elbows at about 45 degrees to your torso.',
      'Stop when your upper arms are level with your torso or a little below, as your shoulders allow.',
      'Press back up and slightly inward without clashing the weights together.',
      'Keep your shoulder blades pinned to the bench throughout.',
    ],
    motion: 'press',
  },

  'Incline Barbell Press': {
    summary:
      'A barbell press on an inclined bench, which shifts more of the work onto the upper chest and front delts than a flat press.',
    muscles: ['Upper Chest', 'Front Delts', 'Triceps'],
    setup: [
      'Set the bench to roughly 30 degrees — steeper turns it into a shoulder press.',
      'Lie back with your eyes under the bar and grip just wider than shoulder-width.',
      'Pull your shoulder blades back and down, feet flat on the floor.',
    ],
    execution: [
      'Unrack and bring the bar over your upper chest.',
      'Lower under control to touch just below your collarbone.',
      'Press back up in a slight arc toward your eye line, keeping your shoulder blades set.',
      'Do not bounce the bar off your chest.',
    ],
    motion: 'press',
  },

  'Close-Grip Bench Press': {
    summary:
      'A bench press with a narrower grip, which increases the work done by the triceps. The heaviest way to train them directly.',
    muscles: ['Triceps', 'Chest', 'Front Delts'],
    setup: [
      'Lie on a flat bench and grip the bar roughly shoulder-width — not narrower, which strains the wrists.',
      'Set your shoulder blades back and down.',
      'Plant your feet and brace.',
    ],
    execution: [
      'Lower the bar to your lower chest, keeping your elbows tucked close to your sides.',
      'Touch lightly, then press back up by straightening your arms.',
      'Keep your wrists stacked over your elbows rather than bent back.',
      'Lock out without flaring your elbows outward.',
    ],
    motion: 'press',
  },

  'Chest Fly': {
    summary:
      'An isolation for the chest — you open your arms wide and bring them back together with only a slight elbow bend. Trained light, for stretch and contraction rather than load.',
    muscles: ['Chest'],
    setup: [
      'Lie on a flat bench with a dumbbell in each hand, pressed over your chest.',
      'Set a slight bend in your elbows and keep it fixed for the whole set.',
      'Pin your shoulder blades back against the bench.',
    ],
    execution: [
      'Open your arms out to the sides in a wide arc, lowering until you feel a stretch across your chest.',
      'Stop level with your torso — going deeper stresses the shoulder without adding chest work.',
      'Squeeze your chest to bring the weights back together along the same arc.',
      'Never straighten and re-bend your elbows to cheat the weight up.',
    ],
    motion: 'press',
  },

  'Cable Crossover': {
    summary:
      'A standing chest fly using two cables, which keeps tension on the muscle through the whole range in a way dumbbells cannot at the top.',
    muscles: ['Chest', 'Front Delts'],
    setup: [
      'Set both pulleys at or slightly above shoulder height and take a handle in each hand.',
      'Step forward into a split stance so the cables are under tension before you start.',
      'Lean very slightly forward with a soft bend in your elbows.',
    ],
    execution: [
      'Bring your hands together in front of your chest in a wide arc, squeezing at the finish.',
      'Let your hands travel back out under control until you feel a stretch.',
      'Keep the elbow angle fixed — this is not a press.',
      'Keep your torso still rather than swinging into each rep.',
    ],
  },

  'Dumbbell Shoulder Press': {
    summary:
      'An overhead press with a dumbbell in each hand, seated or standing. The independent weights let your shoulders find a more comfortable path than a barbell allows.',
    muscles: ['Shoulders', 'Triceps', 'Upper Chest'],
    setup: [
      'Sit or stand with the dumbbells at shoulder height, palms facing forward.',
      'Set your elbows slightly in front of your torso rather than flared straight out.',
      'Brace your core and keep your ribs down.',
    ],
    execution: [
      'Press the weights up and slightly together until your arms are straight.',
      'Keep your head still — do not push it forward under the weights.',
      'Lower under control to about ear height, or as low as stays comfortable.',
      'Avoid arching your lower back to get the last rep.',
    ],
    motion: 'overhead',
  },

  'Arnold Press': {
    summary:
      'An overhead press that starts with your palms facing you and rotates outward as you drive up. The rotation brings the front delts through a longer range than a standard press.',
    muscles: ['Shoulders', 'Triceps'],
    setup: [
      'Sit upright with the dumbbells at chest height, palms facing your body, elbows tucked in.',
      'Brace your core and keep your ribs down.',
      'Start with the weights light — the rotation is harder on the shoulder than it looks.',
    ],
    execution: [
      'Press up while rotating your palms to face forward.',
      'Finish with your arms straight overhead and palms forward.',
      'Reverse both the press and the rotation on the way down.',
      'Keep the movement smooth rather than rotating and pressing as two separate jerks.',
    ],
    motion: 'overhead',
  },

  'Front Raise': {
    summary:
      'An isolation that lifts the weight straight out in front of you, targeting the front of the shoulder. Light weight and strict form — momentum makes it pointless.',
    muscles: ['Front Delts'],
    setup: [
      'Stand tall with a dumbbell in each hand, resting against your thighs.',
      'Set a very slight bend in your elbows.',
      'Brace your core so your torso cannot swing.',
    ],
    execution: [
      'Raise the weights straight out in front of you to about shoulder height.',
      'Pause briefly at the top.',
      'Lower slowly under control.',
      'Keep your torso still — if you are leaning back, the weight is too heavy.',
    ],
  },

  'Rear Delt Fly': {
    summary:
      'An isolation for the back of the shoulders, which most pressing-heavy programmes under-train. Important for shoulder balance and posture.',
    muscles: ['Rear Delts', 'Upper Back'],
    setup: [
      'Hinge forward at the hips until your torso is close to parallel with the floor, or lie chest-down on an incline bench.',
      'Let the dumbbells hang beneath your shoulders with a slight elbow bend.',
      'Keep your back flat and your neck in line with your spine.',
    ],
    execution: [
      'Raise the weights out to the sides, leading with your elbows.',
      'Stop level with your shoulders and squeeze your shoulder blades slightly.',
      'Lower slowly under control.',
      'Keep the weight light — this muscle responds to control, not load.',
    ],
  },

  'Upright Row': {
    summary:
      'A vertical pull that brings the bar up the front of your body to chest height, working the side delts and traps. Use a wider grip and a limited range if your shoulders are at all sensitive.',
    muscles: ['Shoulders', 'Traps'],
    setup: [
      'Hold a barbell or dumbbells in front of your thighs, hands about shoulder-width.',
      'Stand tall with your core braced.',
      'Keep your shoulders back rather than rounded forward.',
    ],
    execution: [
      'Pull the weight up close to your body, leading with your elbows.',
      'Stop when your upper arms reach shoulder height — no higher.',
      'Lower slowly under control.',
      'Stop the set if you feel any pinching in the front of the shoulder.',
    ],
  },

  'Shrug': {
    summary:
      'A simple, heavy isolation for the upper traps — you lift your shoulders straight up against load. Range is short, so it rewards a real pause at the top.',
    muscles: ['Traps'],
    setup: [
      'Hold a barbell or heavy dumbbells at your sides with straight arms.',
      'Stand tall with your chest up and core braced.',
      'Use straps if your grip fails before your traps do.',
    ],
    execution: [
      'Lift your shoulders straight up toward your ears.',
      'Hold the top position for a full second and squeeze.',
      'Lower all the way down to a full stretch.',
      'Do not roll your shoulders — the movement is straight up and down.',
    ],
  },

  'Lateral Raise': {
    summary:
      'The main isolation for the side of the shoulder, which is what gives the shoulders their width. Almost always trained too heavy — light and strict beats heavy and swung.',
    muscles: ['Side Delts'],
    setup: [
      'Stand tall with a dumbbell in each hand at your sides.',
      'Set a slight bend in your elbows and keep it there.',
      'Brace your core so your torso cannot rock.',
    ],
    execution: [
      'Raise the weights out to the sides, leading with your elbows rather than your hands.',
      'Stop at shoulder height — going higher brings the traps in.',
      'Lower slowly, resisting the whole way down.',
      'If you have to swing to start the rep, drop the weight.',
    ],
  },

  'Pull-up': {
    summary:
      'A vertical pull with your palms facing away, lifting your own bodyweight to the bar. The benchmark upper-body pulling movement, and the hardest to progress without assistance.',
    muscles: ['Lats', 'Upper Back', 'Biceps'],
    setup: [
      'Grip the bar slightly wider than shoulder-width, palms facing away.',
      'Hang with your arms straight and your shoulders pulled down away from your ears.',
      'Brace your core and cross your feet behind you.',
    ],
    execution: [
      'Pull your elbows down toward your ribs, driving your chest to the bar.',
      'Continue until your chin clears the bar without craning your neck.',
      'Lower all the way to straight arms under control.',
      'Use a band or assisted machine rather than kipping if you cannot complete clean reps.',
    ],
    motion: 'pull',
  },

  'Chin-up': {
    summary:
      'A pull-up with your palms facing you and a narrower grip. The underhand position brings the biceps in much more, which is why most people can do more chin-ups than pull-ups.',
    muscles: ['Lats', 'Biceps', 'Upper Back'],
    setup: [
      'Grip the bar shoulder-width with your palms facing you.',
      'Hang with straight arms and your shoulders pulled down.',
      'Brace your core so your legs do not swing.',
    ],
    execution: [
      'Pull your elbows down and back, keeping your chest up.',
      'Rise until your chin clears the bar.',
      'Lower all the way down under control to a full hang.',
      'Keep the tempo honest — the lowering half is where most of the growth is.',
    ],
    motion: 'pull',
  },

  'Dumbbell Row': {
    summary:
      'A single-arm horizontal pull with your torso supported. The support takes the lower back out of it, which lets you focus entirely on pulling with the back.',
    muscles: ['Lats', 'Upper Back', 'Biceps'],
    setup: [
      'Place one knee and the same-side hand on a bench, other foot on the floor.',
      'Let the dumbbell hang beneath your shoulder with a straight arm.',
      'Set your back flat and roughly parallel to the floor.',
    ],
    execution: [
      'Pull the dumbbell toward your hip, leading with your elbow.',
      'Squeeze your shoulder blade at the top without twisting your torso.',
      'Lower all the way down to a full stretch.',
      'Keep your hips square — rotating to lift more weight defeats the point.',
    ],
    motion: 'pull',
  },

  'Barbell Row': {
    summary:
      'A bent-over horizontal pull with a barbell. The most loadable back builder there is, and the one most dependent on holding a flat back position.',
    muscles: ['Lats', 'Upper Back', 'Biceps', 'Lower Back'],
    setup: [
      'Stand with the bar over your midfoot and grip it just outside shoulder-width.',
      'Hinge forward until your torso is around 45 degrees or lower, knees softly bent.',
      'Set your back flat and brace hard before the first rep.',
    ],
    execution: [
      'Pull the bar to your lower ribs or upper stomach, leading with your elbows.',
      'Squeeze your shoulder blades together at the top.',
      'Lower under control to straight arms without letting your back round.',
      'Stop the set the moment your torso starts rising to help the weight up.',
    ],
    motion: 'pull',
  },

  'T-Bar Row': {
    summary:
      'A bent-over row using a landmine or dedicated T-bar machine with a neutral grip. The grip and bar path are usually more comfortable than a barbell row at similar loads.',
    muscles: ['Lats', 'Upper Back', 'Biceps'],
    setup: [
      'Straddle the bar and take the handles with a neutral grip.',
      'Hinge forward with a flat back and softly bent knees.',
      'Brace your core and set your shoulders down.',
    ],
    execution: [
      'Pull the handles to your stomach, driving your elbows back.',
      'Squeeze your shoulder blades together at the top.',
      'Lower to a full stretch without rounding your back.',
      'Keep your torso angle fixed for the whole set.',
    ],
    motion: 'pull',
  },

  'Chest-Supported Row': {
    summary:
      'A row performed lying chest-down on an incline bench. Because the bench holds your torso, your lower back does nothing and every rep is pulled with the back alone.',
    muscles: ['Upper Back', 'Lats', 'Rear Delts'],
    setup: [
      'Set an incline bench to roughly 45 degrees and lie chest-down on it.',
      'Let the dumbbells hang straight down beneath your shoulders.',
      'Keep your chest in contact with the pad throughout.',
    ],
    execution: [
      'Pull the weights up toward your hips, leading with your elbows.',
      'Squeeze your shoulder blades together at the top.',
      'Lower slowly to a full stretch.',
      'Do not push your chest off the pad to add range — that reintroduces the cheat this exercise removes.',
    ],
    motion: 'pull',
  },

  'Straight-Arm Pulldown': {
    summary:
      'A cable isolation for the lats with the elbows locked, so the biceps stay out of it. Useful for learning to feel the lats working if rows and pulldowns feel like arm exercises.',
    muscles: ['Lats'],
    setup: [
      'Stand facing a high pulley and take a straight bar or rope with straight arms.',
      'Step back so the cable is under tension and hinge forward slightly.',
      'Lock a very slight bend in your elbows and keep it fixed.',
    ],
    execution: [
      'Pull the bar down in an arc to your thighs, keeping your arms straight.',
      'Squeeze your lats at the bottom.',
      'Let the bar travel back up under control until you feel a stretch.',
      'If your elbows bend, the weight is too heavy.',
    ],
    motion: 'pull',
  },

  'Barbell Curl': {
    summary:
      'The classic biceps builder — you curl a barbell from your thighs to your shoulders. The fixed bar lets you load more than dumbbells, at the cost of a fixed wrist position.',
    muscles: ['Biceps', 'Forearms'],
    setup: [
      'Hold the bar with an underhand grip, hands about shoulder-width.',
      'Stand tall with your elbows tucked against your sides.',
      'Brace your core so your torso cannot swing.',
    ],
    execution: [
      'Curl the bar up by bending your elbows, keeping them pinned to your sides.',
      'Squeeze at the top without swinging your elbows forward.',
      'Lower all the way down to straight arms under control.',
      'If your body is rocking to start the rep, the weight is too heavy.',
    ],
    motion: 'pull',
  },

  'Dumbbell Curl': {
    summary:
      'A biceps curl with a dumbbell in each hand, which lets your wrists rotate naturally and trains each arm independently.',
    muscles: ['Biceps', 'Forearms'],
    setup: [
      'Stand tall with a dumbbell in each hand, palms facing forward or turned in to start.',
      'Tuck your elbows against your sides.',
      'Brace your core and set your shoulders back.',
    ],
    execution: [
      'Curl the weights up toward your shoulders, rotating your palms up as you go if you started neutral.',
      'Squeeze at the top with your elbows still at your sides.',
      'Lower slowly all the way to straight arms.',
      'Curl both arms together or alternate — just keep the tempo the same on each.',
    ],
    motion: 'pull',
  },

  'Incline Dumbbell Curl': {
    summary:
      'A curl performed lying back on an incline bench, so your arms hang behind your torso. That puts the biceps in a stretched position at the bottom, which makes it one of the most effective curl variations.',
    muscles: ['Biceps'],
    setup: [
      'Set a bench to roughly 45 to 60 degrees and sit back against it.',
      'Let your arms hang straight down, dumbbells at your sides, palms forward.',
      'Keep your shoulders back against the pad.',
    ],
    execution: [
      'Curl the weights up without letting your elbows drift forward.',
      'Squeeze at the top.',
      'Lower all the way until your arms are straight and you feel a stretch.',
      'Expect to use less weight here than on a standing curl — the stretch is the point.',
    ],
    motion: 'pull',
  },

  'Hammer Curl': {
    summary:
      'A curl with your palms facing each other throughout. The neutral grip brings in the brachialis and the forearm, which adds thickness to the arm that a standard curl does not.',
    muscles: ['Biceps', 'Brachialis', 'Forearms'],
    setup: [
      'Stand tall with a dumbbell in each hand, palms facing your body.',
      'Tuck your elbows to your sides.',
      'Brace your core.',
    ],
    execution: [
      'Curl the weights straight up, keeping your palms facing each other the whole way.',
      'Stop just short of your shoulders and squeeze.',
      'Lower slowly to straight arms.',
      'Keep your wrists straight rather than letting them bend back.',
    ],
    motion: 'pull',
  },

  'Preacher Curl': {
    summary:
      'A curl performed with your upper arms resting on an angled pad, which removes any chance of swinging and keeps constant tension on the biceps.',
    muscles: ['Biceps'],
    setup: [
      'Sit at the preacher bench with the top of the pad in your armpits.',
      'Rest your upper arms flat on the pad and take the bar with an underhand grip.',
      'Keep your shoulders down rather than shrugged.',
    ],
    execution: [
      'Curl the weight up until your forearms are just past vertical.',
      'Squeeze, then lower slowly.',
      'Go all the way down to straight arms — but do not let the weight drop, the bottom is where this hurts a cold elbow.',
      'Warm up properly before loading this one heavily.',
    ],
    motion: 'pull',
  },

  'Cable Curl': {
    summary:
      'A biceps curl against a low pulley. Unlike dumbbells, the cable keeps tension on the muscle at the top of the rep as well as the bottom.',
    muscles: ['Biceps', 'Forearms'],
    setup: [
      'Attach a straight or EZ bar to a low pulley and take an underhand grip.',
      'Stand a step back from the machine so the cable stays under tension.',
      'Tuck your elbows to your sides and brace.',
    ],
    execution: [
      'Curl the bar up toward your shoulders, elbows fixed at your sides.',
      'Squeeze hard at the top — the cable is still pulling here.',
      'Lower under control to straight arms.',
      'Keep your torso upright rather than leaning back against the weight.',
    ],
    motion: 'pull',
  },

  'Concentration Curl': {
    summary:
      'A single-arm seated curl with your elbow braced against the inside of your thigh. Completely isolates the biceps and makes cheating impossible.',
    muscles: ['Biceps'],
    setup: [
      'Sit on a bench with your legs apart and a dumbbell in one hand.',
      'Brace the back of that upper arm against the inside of your thigh.',
      'Let the weight hang with a straight arm.',
    ],
    execution: [
      'Curl the weight up toward your opposite shoulder.',
      'Squeeze hard at the top for a beat.',
      'Lower all the way down slowly.',
      'Keep your torso still — do not use your back to help.',
    ],
    motion: 'pull',
  },

  'Reverse Curl': {
    summary:
      'A curl with an overhand grip, which shifts the work to the brachialis and the top of the forearm. Builds grip and forearm thickness alongside the arms.',
    muscles: ['Forearms', 'Brachialis', 'Biceps'],
    setup: [
      'Hold a barbell or EZ bar with an overhand grip, hands shoulder-width.',
      'Stand tall with your elbows at your sides.',
      'Keep your wrists straight and firm.',
    ],
    execution: [
      'Curl the bar up, keeping your knuckles pointing up throughout.',
      'Stop at around chest height and squeeze.',
      'Lower slowly to straight arms.',
      'Use noticeably less weight than a standard curl — this position is much weaker.',
    ],
    motion: 'pull',
  },

  'Cable Tricep Pushdown': {
    summary:
      'The staple triceps isolation — you push a cable attachment down by straightening your elbows. Easy to load progressively and easy to keep strict.',
    muscles: ['Triceps'],
    setup: [
      'Attach a bar or rope to a high pulley and grip it at about shoulder-width.',
      'Stand close to the machine with a slight forward lean and your feet staggered.',
      'Pin your elbows to your sides — this is the whole exercise.',
    ],
    execution: [
      'Push the attachment down by straightening your arms fully.',
      'Squeeze your triceps at the bottom for a beat.',
      'Let the weight travel back up until your forearms are just past parallel, elbows still pinned.',
      'If your elbows drift forward or your shoulders roll in, reduce the weight.',
    ],
    motion: 'press',
  },

  'Overhead Tricep Extension': {
    summary:
      'A triceps isolation performed with your arms overhead, which stretches the long head of the triceps under load — a position pushdowns never reach.',
    muscles: ['Triceps'],
    setup: [
      'Sit or stand holding a dumbbell, rope or EZ bar overhead with straight arms.',
      'Keep your elbows pointing forward and close to your head.',
      'Brace your core and keep your ribs down.',
    ],
    execution: [
      'Lower the weight behind your head by bending only your elbows.',
      'Go down until you feel a strong stretch in the triceps.',
      'Straighten your arms to press back up, keeping your elbows in.',
      'Keep your lower back from arching as the weight goes back.',
    ],
    motion: 'overhead',
  },

  'Skull Crusher': {
    summary:
      'A lying triceps extension, lowering the bar toward your forehead. Very effective and very dependent on keeping the elbows still — hence the name.',
    muscles: ['Triceps'],
    setup: [
      'Lie on a flat bench holding an EZ bar or dumbbells with straight arms over your chest.',
      'Tilt your arms slightly back toward your head so tension stays on the triceps.',
      'Set your feet and brace.',
    ],
    execution: [
      'Bend your elbows to lower the weight toward your forehead or just behind it.',
      'Keep your upper arms still — only your forearms move.',
      'Press back up by straightening your arms.',
      'Warm the elbows up first and never rush the lowering half.',
    ],
    motion: 'press',
  },

  'Tricep Kickback': {
    summary:
      'A single-arm triceps isolation — with your torso bent forward and your upper arm fixed, you straighten your elbow behind you. Light weight, strict form, strong contraction at the top.',
    muscles: ['Triceps'],
    setup: [
      'Hinge forward at the hips with one hand on a bench for support, or bend both knees and hinge.',
      'Hold a dumbbell in the working hand and raise that upper arm until it is parallel with your torso.',
      'Keep that upper arm locked in place for the whole set.',
    ],
    execution: [
      'Straighten your elbow to drive the weight back behind you.',
      'Squeeze the triceps hard at full extension and hold for a beat.',
      'Lower slowly back to about 90 degrees without dropping your upper arm.',
      'Keep the weight light — this movement is all about the squeeze, not the load.',
    ],
  },

  'Tricep Dip': {
    summary:
      'A bodyweight press on parallel bars or a bench. With an upright torso it is one of the hardest and most effective triceps builders; lean forward and it becomes a chest exercise.',
    muscles: ['Triceps', 'Chest', 'Front Delts'],
    setup: [
      'Support yourself on parallel bars with straight arms, or sit on a bench with your hands beside your hips.',
      'Keep your torso as upright as possible to bias the triceps.',
      'Pull your shoulders down away from your ears before you start.',
    ],
    execution: [
      'Lower by bending your elbows, keeping them tracking back rather than flaring out.',
      'Stop when your upper arms reach roughly parallel with the floor — deeper strains the shoulder.',
      'Press back up until your arms are straight.',
      'Stop the set immediately if you feel pinching at the front of the shoulder.',
    ],
    motion: 'press',
  },

  'Side Plank': {
    summary:
      'A side-lying isometric that trains the obliques and the muscles that stop your torso collapsing sideways. Directly useful for hip and lower-back stability.',
    muscles: ['Obliques', 'Core', 'Glutes'],
    setup: [
      'Lie on your side with your forearm under your shoulder.',
      'Stack your feet, or stagger them for a wider base.',
      'Lift your hips so your body forms a straight line.',
    ],
    execution: [
      'Hold with your hips lifted and your top shoulder stacked over the bottom one.',
      'Keep your neck in line with your spine.',
      'Do not let your hips drift backward or sag toward the floor.',
      'Hold both sides for the same time even if one is stronger.',
    ],
    motion: 'plank',
  },

  'Hanging Knee Raise': {
    summary:
      'A hanging core movement — you raise your knees toward your chest from a dead hang. Trains the lower abs and hip flexors, plus a good deal of grip.',
    muscles: ['Core', 'Hip Flexors', 'Grip'],
    setup: [
      'Hang from a bar with your arms straight and shoulders pulled down.',
      'Let your legs hang still before the first rep.',
      'Brace your core to stop yourself swinging.',
    ],
    execution: [
      'Raise your knees toward your chest, curling your pelvis up slightly at the top.',
      'Pause briefly at the top rather than bouncing.',
      'Lower slowly under control back to a full hang.',
      'If you start swinging, stop and reset rather than pushing through.',
    ],
  },

  'Russian Twist': {
    summary:
      'A seated rotational core movement — you twist side to side with your feet off the floor. Trains the obliques through rotation.',
    muscles: ['Obliques', 'Core'],
    setup: [
      'Sit with your knees bent and lean back to about 45 degrees.',
      'Lift your feet off the floor if you can hold the position, or keep them down to start.',
      'Hold a weight or medicine ball at your chest.',
    ],
    execution: [
      'Rotate your torso to one side, bringing the weight beside your hip.',
      'Rotate smoothly to the other side without letting your back round.',
      'Turn from your ribcage rather than just swinging your arms.',
      'Keep your chest up throughout — slumping turns this into a lower-back exercise.',
    ],
  },

  'Cable Crunch': {
    summary:
      'A kneeling crunch against a high cable, which lets you load the abs progressively in a way bodyweight crunches cannot.',
    muscles: ['Core'],
    setup: [
      'Kneel facing a high pulley and hold a rope beside your head.',
      'Set your hips back slightly and keep them fixed there for the whole set.',
      'Start with a slight arch and tension already on the cable.',
    ],
    execution: [
      'Crunch down by rounding your spine and bringing your ribs toward your hips.',
      'Squeeze your abs hard at the bottom.',
      'Return slowly under control until you feel a stretch.',
      'Keep your hips still — if they rock back and forth, you are pulling with your hips, not your abs.',
    ],
  },

  'Bicycle Crunch': {
    summary:
      'An alternating crunch that brings each elbow toward the opposite knee. Combines flexion and rotation, so it hits the obliques as well as the front of the abs.',
    muscles: ['Core', 'Obliques'],
    setup: [
      'Lie on your back with your hands lightly beside your head — not pulling on your neck.',
      'Lift your shoulders slightly off the floor and bring your knees up.',
      'Press your lower back toward the floor.',
    ],
    execution: [
      'Bring one knee in and rotate the opposite elbow toward it.',
      'Extend the other leg out straight without letting it touch down.',
      'Alternate smoothly, turning from the torso rather than yanking your neck.',
      'Slow down — this movement is almost always done far too fast to work.',
    ],
  },

  "Farmer's Carry": {
    summary:
      'You pick up heavy weights and walk with them. Trains grip, core, traps and posture all at once, and carries over directly to everyday life.',
    muscles: ['Grip', 'Traps', 'Core', 'Shoulders'],
    setup: [
      'Set a pair of heavy dumbbells or kettlebells on the floor beside your feet.',
      'Hinge down and grip them, then stand up with a flat back.',
      'Stand tall with your shoulders back and your core braced.',
    ],
    execution: [
      'Walk in a straight line with short, controlled steps.',
      'Keep your shoulders down and back — do not let the weight pull you into a slouch.',
      'Do not let the weights swing or bang against your legs.',
      'Set them down deliberately with a hinge rather than dropping them.',
    ],
  },

  'Zone 2 Cardio': {
    summary:
      'Steady, easy-paced cardio held in the zone where you can still hold a conversation. It builds the aerobic base that makes everything else recover faster, and the discipline is keeping it genuinely easy.',
    muscles: ['Heart', 'Lungs', 'Legs'],
    setup: [
      'Pick any steady activity you can sustain — walking on an incline, cycling, rowing, the elliptical.',
      'If you have a heart-rate monitor, aim for roughly 60 to 70 percent of your maximum.',
      'Without one, use the talk test: you should be able to speak in full sentences.',
    ],
    execution: [
      'Build up over the first few minutes rather than starting at full pace.',
      'Hold the same effort for the whole duration — the point is steady, not hard.',
      'If you cannot talk comfortably, slow down; going too hard is the most common mistake here.',
      'Ease off for the last couple of minutes rather than stopping dead.',
    ],
  },

  'Treadmill Incline Walk': {
    summary:
      'Walking uphill on a treadmill. A high-effort, low-impact way to train the aerobic system and the glutes and calves, without the joint cost of running.',
    muscles: ['Heart', 'Glutes', 'Calves', 'Hamstrings'],
    setup: [
      'Start the belt slow and set your incline — 8 to 12 percent is a common working range.',
      'Stand tall and let your arms swing naturally.',
      'Only hold the rails for balance, never to take your weight.',
    ],
    execution: [
      'Walk with a full stride and let your heel land first.',
      'Keep your torso upright rather than leaning on the console.',
      'Adjust speed or incline to hold your target effort as you warm up.',
      'Lower the incline for the last minute or two to cool down.',
    ],
  },

  'Stationary Bike': {
    summary:
      'Low-impact cycling that is easy to hold at a precise effort, which makes it one of the most reliable ways to do steady aerobic work or intervals.',
    muscles: ['Heart', 'Quadriceps', 'Glutes', 'Calves'],
    setup: [
      'Set the saddle so your knee is almost straight at the bottom of the pedal stroke, with a slight bend.',
      'Set the handlebars so you can reach them without rounding your back.',
      'Start pedalling easily with light resistance.',
    ],
    execution: [
      'Hold a smooth, even cadence rather than mashing and coasting.',
      'Use resistance rather than speed alone to reach your target effort.',
      'Keep your hips still in the saddle — rocking side to side means the saddle is too high.',
      'Spin easy for a few minutes at the end.',
    ],
  },

  'Rowing Machine': {
    summary:
      'A full-body cardio machine that works legs, back and arms in one sequence. Excellent conditioning, but only if the stroke order is right.',
    muscles: ['Heart', 'Legs', 'Back', 'Arms'],
    setup: [
      'Strap your feet in with the straps across the widest part of your foot.',
      'Sit tall and take the handle with a relaxed overhand grip.',
      'Start compressed, shins vertical, arms straight.',
    ],
    execution: [
      'Drive with your legs first, then swing your torso back, then pull the handle to your lower ribs.',
      'Reverse that order coming back: arms away, torso forward, then bend your knees.',
      'Keep your back flat throughout rather than rounding at the front of the stroke.',
      'Most of the power comes from your legs — if your arms are burning, the order is wrong.',
    ],
  },

  'Elliptical': {
    summary:
      'A low-impact machine that mimics a running motion without the landing forces. A good option when joints need a break but the aerobic work still needs doing.',
    muscles: ['Heart', 'Legs', 'Glutes'],
    setup: [
      'Step on with your whole foot on each pedal.',
      'Take the moving handles if you want the upper body involved, or the fixed rails if not.',
      'Stand tall rather than leaning your weight onto the handles.',
    ],
    execution: [
      'Build to a steady rhythm and hold it.',
      'Use resistance and incline to reach your target effort rather than simply moving faster.',
      'Keep your heels down on the pedals rather than up on your toes.',
      'Ease off gradually at the end.',
    ],
  },

  'Stair Climber': {
    summary:
      'Continuous stair climbing. Demanding on the glutes and legs as well as the lungs, with far less impact than running.',
    muscles: ['Heart', 'Glutes', 'Quadriceps', 'Calves'],
    setup: [
      'Start the machine at a slow speed and step on carefully.',
      'Stand upright with a light hand on the rails for balance only.',
      'Place your whole foot on each step.',
    ],
    execution: [
      'Take full steps rather than short, quick, shallow ones.',
      'Keep your torso upright — leaning on the rails takes most of the work out of it.',
      'Adjust speed to hold your target effort rather than gripping harder to keep up.',
      'Slow it down for the last minute rather than stepping off at full speed.',
    ],
  },

  'Jump Rope': {
    summary:
      'Skipping for conditioning and calf and foot strength. High impact, so it is built up gradually rather than started at volume.',
    muscles: ['Heart', 'Calves', 'Shoulders', 'Core'],
    setup: [
      'Set the rope length so the handles reach roughly to your armpits when you stand on the middle.',
      'Stand tall with your elbows close to your sides.',
      'Find a surface with some give rather than bare concrete.',
    ],
    execution: [
      'Turn the rope with your wrists, not your whole arms.',
      'Jump just high enough to clear it — an inch or two.',
      'Land softly on the balls of your feet with your knees slightly bent.',
      'Build your volume up over weeks; calves and shins take time to adapt to this one.',
    ],
  },

  'Running': {
    summary:
      'Running, indoors or out, at whatever pace the session calls for. The most accessible aerobic training there is, and the one most worth building up to gradually.',
    muscles: ['Heart', 'Legs', 'Glutes', 'Core'],
    setup: [
      'Start with a few minutes of easy walking or very slow running.',
      'Stand tall with a slight forward lean from the ankles, not the waist.',
      'Keep your shoulders relaxed and your hands unclenched.',
    ],
    execution: [
      'Settle into the pace the session calls for and hold it steady.',
      'Keep your steps light and your cadence quick rather than over-striding out in front of you.',
      'Breathe rhythmically rather than in short gasps.',
      'Finish with a few minutes of easy jogging or walking rather than stopping dead.',
    ],
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
