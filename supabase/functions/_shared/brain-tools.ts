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
    name: 'estimate_body_fat_goal',
    description:
      'Compute the target bodyweight for a stated body-fat-percentage goal (e.g. "get me to 15% ' +
      'body fat"), holding lean mass constant. Uses the latest weight on file — if none exists, ' +
      'ask for their current weight first. Requires a current body-fat % — if the user hasn\'t ' +
      'given one, ask for it or a reasonable estimate instead of guessing yourself. Never state a ' +
      'body-fat target, target weight, or fat-mass-to-lose number in a reply unless this tool ' +
      'returned it — never compute this arithmetic yourself.',
    input_schema: {
      type: 'object',
      properties: {
        current_body_fat_pct: { type: 'number' },
        target_body_fat_pct: { type: 'number' },
      },
      required: ['current_body_fat_pct', 'target_body_fat_pct'],
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
    description:
      'Silently record a brand NEW meal the user hasn\'t already logged. Never use this to correct ' +
      'or add to a meal that read_state already shows as logged today — call update_food on that ' +
      'record instead, or this will create a duplicate. If this returns status "likely_correction", ' +
      'it means a recently-logged meal reads as similar text and NOTHING was saved. Ask the user ' +
      'directly: is this a correction to that earlier meal, or a genuinely separate one (a second ' +
      'serving, a repeat meal)? If they confirm it\'s separate, call log_food again with the SAME ' +
      'description and confirmed_new_meal set to true — that is the only way to actually save it; ' +
      'calling it again without that flag will just be flagged as a likely correction a second time. ' +
      'There is no separate nutrition-lookup step — you must estimate calories/protein_g/carbs_g/' +
      'fat_g yourself from the description using your own food-knowledge before calling this, even ' +
      'when the user gave no quantities (assume a typical single-serving size and say so isn\'t ' +
      'required, just estimate). Confirmed live: calling this with the macro fields omitted silently ' +
      'saves a meal with zero nutrition value, which the Fuel screen and Home\'s macro totals then ' +
      'both read as truly zero — never leave them blank to avoid guessing.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        calories: {
          type: 'number',
          description: 'Your best realistic estimate — never omit even for a vaguely-described meal.',
        },
        protein_g: {
          type: 'number',
          description: 'Grams, your best realistic estimate — never omit even for a vaguely-described meal.',
        },
        carbs_g: {
          type: 'number',
          description: 'Grams, your best realistic estimate — never omit even for a vaguely-described meal.',
        },
        fat_g: {
          type: 'number',
          description: 'Grams, your best realistic estimate — never omit even for a vaguely-described meal.',
        },
        modality: { type: 'string', enum: ['voice', 'text', 'image', 'file', 'live_photo'] },
        confirmed_new_meal: {
          type: 'boolean',
          description:
            'Only set true after the user has explicitly confirmed this is a separate meal from ' +
            'the similar one already logged, not a correction to it. Never set this on a first ' +
            'attempt — only after a prior call returned "likely_correction" and you asked.',
        },
      },
      required: ['description', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
    },
  },
  {
    name: 'update_food',
    description:
      'Correct an existing logged meal in place (wrong quantity, wrong macros, or adding an item to ' +
      'it) — use the exact id from read_state\'s recent_food. Only include the fields that changed; ' +
      'anything omitted keeps its current value. Never call log_food for a correction. Call this WITHOUT ' +
      'confirm first — it returns a preview and saves nothing. Only call it again with confirm:true after ' +
      'the user has explicitly agreed to that exact preview in their next message.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The food_log row id from read_state, not a guess.' },
        description: { type: 'string' },
        calories: { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g: { type: 'number' },
        fat_g: { type: 'number' },
        confirm: {
          type: 'boolean',
          description:
            'Leave false/omitted to get a preview of the change with nothing saved. Set true only after ' +
            'the user explicitly agreed to the previewed values in their most recent message.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call ' +
            '(confirm omitted/false) just returned. A stale, missing, or invented token is rejected ' +
            'and returns a fresh preview instead of saving anything.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_food',
    description:
      'Remove an incorrectly logged meal entirely (e.g. it was a duplicate, or never actually eaten) ' +
      '— use the exact id from read_state\'s recent_food. Call this WITHOUT confirm first — it returns a ' +
      'preview of what would be removed and deletes nothing. Only call it again with confirm:true after ' +
      'the user has explicitly agreed in their next message.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The food_log row id from read_state, not a guess.' },
        confirm: {
          type: 'boolean',
          description:
            'Leave false/omitted to preview what would be deleted with nothing removed. Set true only ' +
            'after the user explicitly agreed to remove it in their most recent message.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. A stale, missing, or invented token is rejected and returns a fresh preview ' +
            'instead of deleting anything.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'log_workout',
    description:
      'Silently record a completed workout — not for an in-app active session (that logs sets ' +
      'client-side on its own; use skip_exercise/add_set/end_workout for those). Never invent or ' +
      'default sets/reps/load — if the user didn\'t state a value, omit that field or ask, don\'t ' +
      'guess. Call this WITHOUT confirm first — it returns a preview of what would be logged, ' +
      'nothing is saved yet. Only call it again with confirm:true after the user has explicitly ' +
      'agreed to that exact preview in their next message.',
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
        confirm: {
          type: 'boolean',
          description:
            'Leave false/omitted to get a preview with nothing saved. Set true only after the user ' +
            'explicitly agreed to the previewed exercises in their most recent message.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. A stale, missing, or invented token is rejected and returns a fresh preview ' +
            'instead of saving anything.',
        },
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
      "Open today's scheduled session in the app so the user can review it and tap Start themselves " +
      '— use for "take me to my workout" or "show me today\'s workout". Does NOT start the workout ' +
      '— for "let\'s start"/"begin the workout" use start_todays_workout instead. Returns no_session ' +
      "if today is a rest day or there's no active plan; tell the user that instead of navigating.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'start_todays_workout',
    description:
      "Actually START today's scheduled session right now — launches the live in-app workout " +
      'screen with the timer and set-tracking running. Use only when the user has clearly ' +
      'confirmed they want to begin working out this moment ("let\'s start", "begin the workout", ' +
      '"yes, start it"), not for merely wanting to see/review it (use open_todays_workout for ' +
      'that). Call this WITHOUT confirm first — it returns a preview of which session would start ' +
      'and launches nothing. Only call it again with confirm:true once the user has explicitly ' +
      "agreed in their next message. Returns no_session if today is a rest day or there's no " +
      'active plan, or already_active if a session is already running.',
    input_schema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Leave false/omitted to preview which session would start with nothing launched. Set true only after explicit agreement in their next message.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. A stale, missing, or invented token is rejected and returns a fresh preview ' +
            'instead of starting anything.',
        },
      },
    },
  },
  {
    name: 'reschedule_today',
    description:
      "Move today off as a rest day without touching the rest of the plan — use for \"let's skip " +
      'today"/"push today back"/"I need a rest day" instead of update_training_plan, which would ' +
      'replace the entire plan. Call this WITHOUT confirm first — it returns a preview of what ' +
      'would become due tomorrow instead, with nothing saved. Only call it again with confirm:true ' +
      "after the user has explicitly agreed in their next message.",
    input_schema: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: 'Leave false/omitted to preview; true only after explicit agreement.' },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. A stale, missing, or invented token is rejected and returns a fresh preview ' +
            'instead of rescheduling anything.',
        },
      },
    },
  },
  {
    name: 'show_plan_breakdown',
    description:
      "Show the user's active training plan as a structured breakdown card (program title, each day's focus and exercises, and start/modify actions) instead of describing it in a wall of text. Use this whenever they ask for an overview, breakdown, or \"what's my plan\" — pair it with one short natural sentence, not a text description of the plan itself.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_daily_workout',
    description:
      "Show today's (or the next due) scheduled session as a structured card — session title, estimated duration, and each exercise with its sets/reps/rest — instead of listing it out in text. Use this for \"what's today's workout\", \"what's my next session\", or similar single-day requests (not \"show my whole plan\", which is show_plan_breakdown). Returns no_session if today is a rest day or there's no active plan — tell the user that instead of inventing a workout. Pair the card with one short natural sentence, not a text description of the exercises.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_nutrition_summary',
    description:
      "Show today's nutrition as a structured card — calories remaining today and each macro target — instead of reciting the numbers in text. Use for \"nutrition summary\", \"how am I doing on food today\", or similar. Returns no_targets if nutrition targets haven't been set yet. Pair with one short natural sentence (e.g. how much room is left on a specific macro), not a restatement of every number.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_progress_report',
    description:
      "Show a structured weekly performance card — an overall score, how it compares to last week, and a 7-day trend — instead of describing progress in text. Use for \"progress report\", \"how am I trending\", or similar week-level requests (not a single day's workout or a single lift). Pair with one short natural sentence about the trend.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_readiness',
    description:
      "Show today's training readiness as a structured card — a 0-100 score and a plain-language recommendation (e.g. train normally vs. train with caution) — instead of describing it in text. Use for \"how's my readiness\", \"should I train hard today\", or similar. This is a rest-gap heuristic (days since last session, recent streak), not wearable-derived — never claim it's based on sleep or HRV data the app doesn't have. Pair with one short natural sentence.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_top_lifts',
    description:
      "Show the user's best working weight per exercise (top 3) as a structured card instead of listing them in text. Use for \"top lifts\", \"what's my best lift\", or similar. The card may be empty if not enough sessions have been logged yet — tell the user that plainly rather than inventing numbers. Pair with one short natural sentence.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'show_previous_workout',
    description:
      "Show the user's most recently logged workout as a structured recap card (sets done vs target, top set, duration) instead of describing it in text. Use for phrases like \"what was my last workout\" or \"previous session\". If nothing has ever been logged, say so plainly instead of inventing one.",
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
      "Move on from the current exercise in the user's active in-app workout session to the next one, without logging a set for it. Call this for explicit \"skip\"/\"next exercise\" wording, AND for phrases that name a different, later exercise in the session instead of the current one — e.g. \"let's start dumbbell press\" or \"let's do overhead press now\" while bench press is still current — confirmed live: agreeing to that verbally without calling this leaves the app still showing the old exercise as current, out of sync with what you just said. Only works while a session is actually running in the app, and only advances to the exercise that's actually next in this session — never to an arbitrary exercise the user names that isn't queued up.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'add_set',
    description:
      "Add one extra set to the current exercise in the user's active in-app workout session (e.g. \"let's do one more set of this\"). Only works while a session is actually running in the app.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'undo_last_set',
    description:
      "Remove the most recently logged set in the user's active in-app workout session — use when " +
      'they say the last one was wrong, misheard, or shouldn\'t have been logged (e.g. "that\'s ' +
      'wrong, undo that" or "I didn\'t say that"). Only undoes the single most recent set; only ' +
      'works while a session is actually running and a set was just logged.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'end_workout',
    description:
      "End the user's currently active in-app workout session and generate its report. Only works while a session is actually running in the app — if you're not sure one is, ask before calling this. " +
      'Call this WITHOUT confirm first — it returns a preview of what would be saved and ends nothing. ' +
      'Only call it again with confirm:true and the exact confirm_token the preview returned, once the ' +
      'user has explicitly agreed to end it now.',
    input_schema: {
      type: 'object',
      properties: {
        completed: { type: 'boolean', description: 'true if they finished as planned, false if cutting it short' },
        confirm: {
          type: 'boolean',
          description: 'Leave false/omitted to preview what would happen with nothing ended. Set true only after explicit agreement in their next message.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. A stale, missing, or invented token is rejected and returns a fresh preview ' +
            'instead of ending anything.',
        },
      },
      required: ['completed'],
    },
  },
  {
    name: 'adjust_rest_timer',
    description:
      "Adjust the rest timer currently running on the user's active in-app workout session — the same " +
      'timer the screen shows. Only works while a real rest period is actually counting down (the live ' +
      "session state block tells you the current remaining/target seconds); if it doesn't show one, ask " +
      "before calling this. This only requests the change — the app applies it, so don't say a new time " +
      'or that rest was skipped/paused/resumed as settled fact until the next live session state block ' +
      'confirms it; say what you just asked for, not that it already happened.',
    input_schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['extend', 'skip', 'pause', 'resume'] },
        seconds: { type: 'integer', description: 'How many seconds to add — only used when action is "extend".' },
      },
      required: ['action'],
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

const CARD_ONLY_TOOLS = new Set([
  'show_plan_breakdown',
  'show_daily_workout',
  'show_nutrition_summary',
  'show_progress_report',
  'show_readiness',
  'show_top_lifts',
  'show_previous_workout',
]);
export const VOICE_TOOLS = BRAIN_TOOLS.filter((tool) => !CARD_ONLY_TOOLS.has(tool.name));
