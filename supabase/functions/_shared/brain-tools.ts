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
] as const;

export type BrainToolName = (typeof BRAIN_TOOLS)[number]['name'];
