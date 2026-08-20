// The brain's tool contract — see docs/coaching-brain.md. Anthropic tool schemas (data only,
// no I/O), shared between the edge function (Deno) and orchestrator tests (Node).

const exerciseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Exercise name, matched against the catalog.' },
    sets: { type: 'integer' },
    rep_scheme: { type: 'string', description: "e.g. '8-10', 'AMRAP'" },
    load_scheme: { type: 'string', description: "e.g. '%1RM', 'RPE 8'" },
  },
  required: ['name', 'sets', 'rep_scheme'],
};

const sessionSchema = {
  type: 'object',
  properties: {
    day_order: { type: 'integer' },
    weekday: { type: 'integer', description: '0-6, omit if the split is flexible.' },
    focus: { type: 'string', description: "e.g. 'legs', 'push', 'full_body'" },
    exercises: { type: 'array', items: exerciseSchema },
  },
  required: ['day_order', 'focus', 'exercises'],
};

export const BRAIN_TOOLS = [
  {
    name: 'read_state',
    description:
      'Fetch the user’s current plan, nutrition targets, recent logs, and active injuries for context before proposing anything.',
    input_schema: {
      type: 'object',
      properties: {
        scope: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['profile', 'plan', 'nutrition', 'injuries', 'recent_logs', 'recent_messages'],
          },
        },
      },
      required: ['scope'],
    },
  },
  {
    name: 'generate_training_plan',
    description:
      'Propose a full training plan from goals/frequency/history/biometrics/injuries. Every exercise is checked against active injuries before it can persist — if rejected, revise and call again.',
    input_schema: {
      type: 'object',
      properties: {
        split: { type: 'string', description: "e.g. 'upper/lower', 'push/pull/legs'" },
        days_per_week: { type: 'integer' },
        sessions: { type: 'array', items: sessionSchema },
      },
      required: ['split', 'days_per_week', 'sessions'],
    },
  },
  {
    name: 'update_training_plan',
    description:
      'Replace the active training plan with a revised one (e.g. "knee’s flaring, swap legs for upper"). Same injury-safety check as generate_training_plan.',
    input_schema: {
      type: 'object',
      properties: {
        changes_summary: { type: 'string', description: 'One line describing what changed and why.' },
        split: { type: 'string' },
        days_per_week: { type: 'integer' },
        sessions: { type: 'array', items: sessionSchema },
      },
      required: ['changes_summary', 'split', 'days_per_week', 'sessions'],
    },
  },
  {
    name: 'generate_nutrition_targets',
    description: 'Set calorie/macro targets from the user’s goal and biometrics.',
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', enum: ['cut', 'bulk', 'recomp', 'maintain'] },
        activity_level: {
          type: 'string',
          enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'update_nutrition_targets',
    description:
      'Recompute calorie/macro targets after a goal change (e.g. "I’m cutting now"). Call this together with update_training_plan whenever the goal changes.',
    input_schema: {
      type: 'object',
      properties: {
        goal: { type: 'string', enum: ['cut', 'bulk', 'recomp', 'maintain'] },
        activity_level: {
          type: 'string',
          enum: ['sedentary', 'light', 'moderate', 'active', 'very_active'],
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'record_injury',
    description:
      'Log a new or worsened injury. This re-checks the active plan — if it’s now unsafe, you must call update_training_plan next.',
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: "e.g. 'left_knee', 'lumbar', 'right_shoulder'" },
        severity: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['area'],
    },
  },
  {
    name: 'log_food',
    description: 'Silently record a meal from the conversation.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        calories: { type: 'integer' },
        protein_g: { type: 'integer' },
        carbs_g: { type: 'integer' },
        fat_g: { type: 'integer' },
        modality: { type: 'string', enum: ['voice', 'text', 'image', 'file', 'live_photo'] },
      },
      required: ['description'],
    },
  },
  {
    name: 'log_workout',
    description: 'Silently record a completed workout.',
    input_schema: {
      type: 'object',
      properties: {
        plan_session_id: { type: 'string' },
        exercises_done: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              sets: { type: 'integer' },
              reps: { type: 'string' },
              load: { type: 'string' },
            },
            required: ['name'],
          },
        },
        note: { type: 'string' },
      },
      required: ['exercises_done'],
    },
  },
  {
    name: 'log_checkin',
    description: 'Silently record a weight/mood/sleep/soreness check-in.',
    input_schema: {
      type: 'object',
      properties: {
        weight_kg: { type: 'number' },
        mood: { type: 'integer' },
        sleep_hours: { type: 'number' },
        soreness: { type: 'integer' },
        note: { type: 'string' },
      },
    },
  },
  {
    name: 'open_screen',
    description:
      'Navigate the app to one of the main tabs — use when the user asks to see their progress, stats, nutrition, or recovery.',
    input_schema: {
      type: 'object',
      properties: {
        screen: { type: 'string', enum: ['Home', 'Stats', 'Body', 'Fuel', 'Recovery'] },
      },
      required: ['screen'],
    },
  },
  {
    name: 'open_todays_workout',
    description:
      "Open today's scheduled session in the app so the user can review and start it — use for requests like \"take me to my workout\" or \"let's start\". Returns no_session if today is a rest day or there's no active plan; tell the user that instead of navigating.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_plan_breakdown',
    description:
      "Show the user's active training plan as a structured breakdown card (program title, each day's focus and exercises, and start/modify actions) instead of describing it in a wall of text. Use this whenever they ask for an overview, breakdown, or \"what's my plan\" — pair it with one short natural sentence, not a text description of the plan itself.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'swap_exercise',
    description:
      "Swap an upcoming exercise in the user's active in-app session for a same-muscle-group, injury-safe alternative from the catalog (e.g. \"swap out face pulls, my shoulder's bothering me\"). Only works while a session is actually running and the exercise hasn't started yet.",
    input_schema: {
      type: 'object',
      properties: {
        current_exercise_name: { type: 'string', description: 'Exact catalog name of the exercise to replace.' },
      },
      required: ['current_exercise_name'],
    },
  },
  {
    name: 'skip_exercise',
    description:
      "Skip the current exercise in the user's active in-app workout session and move to the next one, without logging a set for it. Only works while a session is actually running in the app.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'end_workout',
    description:
      "End the user's currently active in-app workout session and generate its report. Only works while a session is actually running in the app — if you're not sure one is, ask before calling this.",
    input_schema: {
      type: 'object',
      properties: {
        completed: { type: 'boolean', description: 'true if they finished as planned, false if cutting it short' },
      },
      required: ['completed'],
    },
  },
  {
    name: 'update_profile',
    description:
      'Correct the user\'s stored display name (e.g. "my name is spelled Damion, not Damien"). Goal, injury, weight, and schedule corrections go through update_nutrition_targets, record_injury, log_checkin, and update_training_plan instead.',
    input_schema: {
      type: 'object',
      properties: {
        display_name: { type: 'string' },
      },
      required: ['display_name'],
    },
  },
] as const;

export type BrainToolName = (typeof BRAIN_TOOLS)[number]['name'];

export const VOICE_TOOLS = BRAIN_TOOLS.filter((tool) => tool.name !== 'show_plan_breakdown');
