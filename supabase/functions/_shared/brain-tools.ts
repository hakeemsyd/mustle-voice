// The brain's tool contract — see docs/coaching-brain.md. Anthropic tool schemas (data only,
// no I/O), shared between the edge function (Deno) and orchestrator tests (Node).

const exerciseSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Exercise name, matched against the catalog.' },
    sets: {
      type: 'integer',
      description:
        "How many sets. When the user wrote their own workout, \"x4\"/\"\u00d74\" after an exercise is " +
        'this number, NOT the reps.',
    },
    rep_scheme: {
      type: 'string',
      description:
        "The REP TARGET, e.g. '8-10', 'AMRAP'. For a timed movement this is a duration ('25 " +
        "minutes'). NEVER copy the set count into this field: a workout written as 'Hammer curls " +
        "40s x3' states three SETS and says nothing about reps, and answering '3 reps' is a number " +
        'the user never gave. When their own workout gives sets and load but no rep target, either ' +
        'ask them for it or use their logged history for that exercise and say which you did.',
    },
    load_scheme: {
      type: 'string',
      description:
        "What weight to use, written for someone standing in front of the bar. Never leave blank. " +
        "Use their real numbers when read_state has them, written in the units the context block says " +
        "the user reads in (e.g. '60 kg' / '135 lb', 'last time: 22.5 kg each'). " +
        "CONVERT before you write this. When the user's own workout states a unit once ('Pushdowns " +
        "50 lb'), every bare number in that same list is in that unit too ('40s' is 40 lb), and each " +
        "one must be converted into the unit they read in — confirmed live: a list written in pounds " +
        "produced '40 kg each' on the workout card, which is 88 lb dumbbell curls. Never take their " +
        "number and simply attach the display unit to it. " +
        "When it does not — which is every brand-new user — give a concrete starting point instead: " +
        "'bodyweight', 'empty bar to start', 'light — find your working weight'. NEVER a percentage " +
        "of one-rep max ('%1RM', '70-80% 1RM') for anyone: the app never records a tested 1RM, so it " +
        "is replaced on save and the coach reads it aloud as \"at one rep max\", which is meaningless " +
        "for a set of 8. With prior working sets, write the real weight ('last time: 60 kg').",
    },
  },
  required: ['name', 'sets', 'rep_scheme'],
};

const sessionSchema = {
  type: 'object',
  properties: {
    day_order: { type: 'integer' },
    focus: { type: 'string', description: "e.g. 'legs', 'push', 'full_body'" },
    exercises: { type: 'array', items: exerciseSchema },
  },
  required: ['day_order', 'focus', 'exercises'],
};

const trainingDaysSchema = {
  type: 'array',
  items: { type: 'string', enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
  description:
    "The weekdays they train on, exactly as agreed in the consultation (e.g. 6 days Monday to Saturday " +
    "with Sunday off). Every other weekday is a rest day on Home and the Calendar. The sessions still " +
    "run in rotation order across these days: a missed day keeps its session next. Omit only when they " +
    'gave no preference.',
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
      "Propose a brand-new user's first full training plan from goals/frequency/history/biometrics/injuries. " +
      "Refuses (nothing saved) until the consultation has covered equipment, diet, schedule, and any " +
      "remaining goal/injury clarification — call note_consultation_covered as each is resolved first. Every " +
      "exercise is checked against active injuries before it can persist — if rejected, revise and call " +
      'again. Call WITHOUT confirm first — it returns a preview, nothing is saved yet. Before confirming, this ' +
      "is the moment for a real initial consultation: read back the plan and the proposed nutrition approach, " +
      "and confirm which real day they'd like to start (today, tomorrow, a specific weekday) — never assume. " +
      'Only call again with confirm:true, starts_on, and the same confirm_token once they explicitly agree.',
    input_schema: {
      type: 'object',
      properties: {
        split: { type: 'string', description: "e.g. 'upper/lower', 'push/pull/legs'" },
        days_per_week: { type: 'integer' },
        training_days: trainingDaysSchema,
        sessions: { type: 'array', items: sessionSchema },
        confirm: {
          type: 'boolean',
          description:
            'Leave false/omitted to get a preview with nothing saved. Set true only after the user explicitly ' +
            'agreed to the plan and start day in their most recent message.',
        },
        starts_on: {
          type: 'string',
          description:
            "The real calendar date the user agreed to start, as YYYY-MM-DD — e.g. if today is 2026-09-22 " +
            "(Tuesday) and they say 'next Monday', that's 2026-09-28. Required alongside confirm:true; omit " +
            'on the preview call.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just returned.',
        },
      },
      required: ['split', 'days_per_week', 'sessions'],
    },
  },
  {
    name: 'update_training_plan',
    description:
      'Replace the active training plan with a revised one (e.g. "knee’s flaring, swap legs for upper"). Same ' +
      "injury-safety check as generate_training_plan. Does not change the plan's start date — see " +
      'update_plan_start_date for that.',
    input_schema: {
      type: 'object',
      properties: {
        changes_summary: { type: 'string', description: 'One line describing what changed and why.' },
        split: { type: 'string' },
        days_per_week: { type: 'integer' },
        training_days: { ...trainingDaysSchema, description: `${trainingDaysSchema.description} Omit to keep the current training days.` },
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
        pain_level: {
          type: 'number',
          description:
            'Pain on a 0-10 scale, if the user gave one ("8 out of 10" -> 8) or it can be reasonably ' +
            'inferred ("really bad" -> 7-8, "mild" -> 2-3). Omit if genuinely unclear. This is read back ' +
            'to you every turn and drives whether you can give exercise guidance for this area at all — ' +
            'get it if you can.',
        },
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
      'both read as truly zero — never leave them blank to avoid guessing. ' +
      'ASK AT MOST ONE ROUND OF QUESTIONS before calling this, and only when the food itself is ' +
      'unidentifiable. Portion size, cooking method, brand and sides are things you estimate, not ' +
      'things you ask about: a typical serving is always a good enough answer, and the user can ' +
      'correct it afterwards with update_food. Confirmed live: a second round of clarifying ' +
      'questions after the user had already answered one made logging a single meal feel like an ' +
      'interrogation. If you have already asked once, estimate and log.',
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
        confirm: {
          type: 'boolean',
          description:
            'Leave unset on the first call: that returns a preview and saves NOTHING. Set true only ' +
            'after you have read the estimate back and the user agreed in their next message.',
        },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. It is bound to these exact macro values, so a token from a different estimate ' +
            'will not verify.',
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
              load: {
                type: 'string',
                description:
                  'Comma-separated KILOGRAM numbers, one per set, with NO unit text — "60,60,62.5". ' +
                  'Storage is always kilograms even when you speak to the user in pounds: convert first ' +
                  '(kg = lb / 2.205). Never write "95 lb" or any other unit into this field. Use the ' +
                  'literal string "bodyweight" when no weight was used.',
              },
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
    name: 'resolve_interrupted_workout',
    description:
      'Resolves a workout that was interrupted and never formally finished (see the context note ' +
      'about it, which gives the workout_log_id). Use this the first time it comes up in a genuinely ' +
      'new conversation — ask what happened (finished it without the app, ended early, or want to ' +
      'discard it — "lost connection/battery" or "left the gym" also map to whichever of those it ' +
      'ends up being) before choosing an outcome. Call once WITHOUT confirm to preview, state plainly ' +
      'what will happen, wait for explicit agreement, then call again with confirm:true and the exact ' +
      'confirm_token.',
    input_schema: {
      type: 'object',
      properties: {
        workout_log_id: { type: 'string' },
        outcome: {
          type: 'string',
          enum: ['completed_independent', 'ended_early', 'discard'],
          description:
            'completed_independent: they finished it without the app — pair with additional_exercises_done ' +
            'for anything not already tracked live. ended_early: they stopped partway and did not finish ' +
            'the rest — keeps whatever was already tracked live, adds nothing. discard: drop it entirely, ' +
            'as if it never happened.',
        },
        additional_exercises_done: {
          type: 'array',
          description:
            'Only for completed_independent — exercises/sets done AFTER the interruption that were not ' +
            'already tracked live. Never repeat an exercise already covered by the live-tracked portion.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              sets: { type: 'integer' },
              reps: { type: 'string' },
              load: {
                type: 'string',
                description:
                  'Comma-separated KILOGRAM numbers, one per set, with NO unit text — "60,60,62.5". ' +
                  'Storage is always kilograms even when you speak to the user in pounds: convert first ' +
                  '(kg = lb / 2.205). Never write "95 lb" or any other unit into this field. Use the ' +
                  'literal string "bodyweight" when no weight was used.',
              },
            },
            required: ['name', 'sets', 'reps', 'load'],
          },
        },
        confirm: { type: 'boolean' },
        confirm_token: { type: 'string' },
      },
      required: ['workout_log_id', 'outcome'],
    },
  },
  {
    name: 'log_checkin',
    description: 'Silently record a weight/mood/sleep/soreness check-in.',
    input_schema: {
      type: 'object',
      properties: {
        weight_kg: {
          type: 'number',
          description:
            'Bodyweight in KILOGRAMS, always. If the user states pounds, convert before calling: ' +
            'kg = lb / 2.205. Never pass a pound figure through unchanged.',
        },
        mood: { type: 'integer' },
        sleep_hours: { type: 'number' },
        soreness: { type: 'integer' },
        body_fat_pct: { type: 'number', description: 'Body fat percentage, if the user reports one.' },
        note: { type: 'string' },
      },
    },
  },
  {
    name: 'open_screen',
    description:
      'Navigate the app to one of the main tabs — use when the user asks to see their progress, stats, nutrition, or recovery, ' +
      'including "where can I see that", "how do I check X" — actually open it for them rather than just naming the tab and ' +
      'leaving them to find it themselves. ' +
      'For "resume/reopen/go back to the workout" while a live session state block shows one genuinely in progress, use screen: ' +
      "\"ActiveSession\" instead — returns no_session if nothing is actually running, in which case tell the user that rather " +
      'than claiming it opened.',
    input_schema: {
      type: 'object',
      properties: {
        screen: { type: 'string', enum: ['Home', 'Stats', 'Body', 'Fuel', 'Recovery', 'ActiveSession'] },
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
        train_on_rest_day: {
          type: 'boolean',
          description:
            'Set true only when today is a scheduled rest day and the user explicitly wants to train ' +
            'anyway. Their next session in the rotation becomes today\'s session; the order continues ' +
            'from it afterwards.',
        },
      },
    },
  },
  {
    name: 'reschedule_today',
    description:
      "Move a training day off as a rest day without touching the rest of the plan — use for \"let's skip " +
      'today"/"push today back"/"I need a rest day"/"I can\'t train Monday" instead of ' +
      'update_training_plan, which would replace the entire plan. Defaults to today; pass `date` to ' +
      'move a FUTURE day instead. Call this WITHOUT confirm first — it returns a preview of what ' +
      'would become due instead, with nothing saved. Only call it again with confirm:true ' +
      "after the user has explicitly agreed in their next message.",
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description:
            'YYYY-MM-DD, today or later. Omit for today. Work it out from the date in your context ' +
            'block rather than guessing which date a weekday falls on — the result tells you the ' +
            'weekday it actually landed on, so check that against what the user asked for.',
        },
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
    name: 'note_consultation_covered',
    description:
      'Call the moment a consultation topic has actually been resolved — including when the user ' +
      'explicitly defers ("I don\'t know, use your judgment", "doesn\'t matter to me"), which counts as ' +
      'resolved, not a reason to keep asking. Never visible to the user; purely internal bookkeeping so ' +
      'the app knows generate_training_plan can be proposed. Only relevant before a plan exists.',
    input_schema: {
      type: 'object',
      properties: {
        topics: {
          type: 'array',
          items: { type: 'string', enum: ['equipment', 'diet', 'schedule', 'goals_injuries'] },
          description: 'One or more of the four topics just resolved in this turn.',
        },
      },
      required: ['topics'],
    },
  },
  {
    name: 'update_plan_start_date',
    description:
      'Move the active plan\'s start date — use for "actually, can I start today", "let\'s not wait until ' +
      'Monday", "can we start Wednesday instead" said about the PLAN starting (not about beginning a ' +
      'workout right now — that is start_todays_workout). Only valid while the plan has not started yet; ' +
      "if it already has, say so instead of calling this. A clear, unambiguous request is itself " +
      "sufficient — call with confirm:true directly. Only preview first (call without confirm) when you're " +
      'inferring intent rather than hearing it stated.',
    input_schema: {
      type: 'object',
      properties: {
        new_starts_on: { type: 'string', description: 'YYYY-MM-DD. Omit to mean "starting today".' },
        confirm: { type: 'boolean', description: 'Leave false/omitted to preview; true once confident.' },
      },
    },
  },
  {
    name: 'update_training_days',
    description:
      'Change which weekdays they train on, for good ("move my rest day to Saturday", "I can only train ' +
      'Monday, Wednesday and Friday now"). The sessions and their order stay the same; only the days ' +
      'change, and Home and the Calendar update straight away. For a single day off use reschedule_today; ' +
      'for training on one rest day only use start_todays_workout with train_on_rest_day. Only call once ' +
      'the user has asked for it.',
    input_schema: {
      type: 'object',
      properties: {
        training_days: { ...trainingDaysSchema, description: 'The full new set of training weekdays.' },
      },
      required: ['training_days'],
    },
  },
  {
    name: 'create_custom_session',
    description:
      'Build a ONE-OFF workout for today that replaces whatever the plan has scheduled — including ' +
      'a rest day. This is the tool for "swap the rest day for an arms workout", "I want to do legs ' +
      'instead today", "give me a quick push session". It does NOT change the training plan: the ' +
      'program is untouched and resumes tomorrow, which is why this is right and update_training_plan ' +
      '(which replaces the entire plan) is wrong. On success the session becomes today\'s session ' +
      'everywhere in the app — Home shows it with a Start button, and start_todays_workout will run ' +
      'it. Every exercise name must come from the catalog listed in your instructions, and every one ' +
      'is checked against active injuries before anything is saved; if it comes back rejected, revise ' +
      'and call again. Call WITHOUT confirm first — that returns a preview and saves nothing. Only ' +
      'call again with confirm:true and the exact confirm_token after the user has explicitly agreed ' +
      'in their next message. Until it returns status "created", nothing exists: do not tell the user ' +
      'they are all set, do not tell them to start it, and do not describe the session as real.',
    input_schema: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          description: "What this session is, in the user's words — e.g. 'arms', 'legs', 'quick push'.",
        },
        exercises: {
          type: 'array',
          description: '3-8 exercises, in the order they should be performed.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Exact catalog name.' },
              sets: {
                type: 'integer',
                description:
                  "How many sets. When the user wrote their own workout, \"x4\"/\"\u00d74\" after an " +
                  'exercise is this number, NOT the reps.',
              },
              rep_scheme: {
      type: 'string',
      description:
        "The REP TARGET, e.g. '8-10', 'AMRAP'. For a timed movement this is a duration ('25 " +
        "minutes'). NEVER copy the set count into this field: a workout written as 'Hammer curls " +
        "40s x3' states three SETS and says nothing about reps, and answering '3 reps' is a number " +
        'the user never gave. When their own workout gives sets and load but no rep target, either ' +
        'ask them for it or use their logged history for that exercise and say which you did.',
    },
              load_scheme: {
                type: 'string',
                description:
                  "Never leave blank — their prior numbers if known, otherwise a sensible start " +
                  "(e.g. 'bodyweight', 'light — find your working weight').",
              },
            },
            required: ['name', 'sets', 'rep_scheme'],
          },
        },
        source_omissions: {
          type: 'array',
          items: { type: 'string' },
          description:
            "When the user supplied their own workout (a photo, screenshot or pasted list), every " +
            'line of it you are NOT building, each with the reason — e.g. "Zone 2 25 min: no cardio ' +
            'entry", "kickbacks: not in the catalog". Pass an empty array when you are building the ' +
            'source in full, and omit the field entirely when there was no source. The preview reads ' +
            'these back to the user, so a line left out here is a line they will discover missing ' +
            'later on their own workout screen.',
        },
        confirm: { type: 'boolean', description: 'Leave false/omitted to preview; true only after explicit agreement.' },
        confirm_token: {
          type: 'string',
          description:
            'Required alongside confirm:true — the exact confirm_token string the preview call just ' +
            'returned. A stale, missing, or invented token is rejected and returns a fresh preview ' +
            'instead of creating anything.',
        },
      },
      required: ['focus', 'exercises'],
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
      "Replace ONE exercise in today's workout with a same-muscle-group, injury-safe alternative from " +
      "the catalog (e.g. \"swap out face pulls, my shoulder's bothering me\", \"the bench is taken, give me " +
      "push-ups instead\"). THIS IS THE TOOL FOR ANY SINGLE-EXERCISE SUBSTITUTION, whether the session is " +
      "already running or the user is still on the workout preview before starting — it handles both. " +
      "NEVER use create_custom_session to substitute one exercise: that rebuilds the entire session and " +
      "has listed an exercise twice doing it (confirmed live). Everything except the named exercise stays " +
      "exactly as it was, and the training plan itself is never changed. " +
      'IF THE USER NAMED WHAT THEY WANT INSTEAD, pass it as replacement_exercise_name — leaving it out ' +
      'lets the app pick any same-pattern exercise, which is how a user who asked for Incline Dumbbell ' +
      'Press was given Overhead Press instead (confirmed live). Only omit it when they asked you to ' +
      'choose. SAYING THEY ARE USING DIFFERENT EQUIPMENT IS A SWAP REQUEST: "I\'m using dumbbells" on ' +
      'Bench Press means call this with replacement_exercise_name "Dumbbell Bench Press". Confirmed ' +
      'live: the coach answered "got it, dumbbell bench" without calling this, the card stayed on Bench ' +
      'Press, and the user spent the session arguing with the app. Never say the new exercise name as ' +
      'if it were current until this returns "swapped" or "swapped_for_today" — report the ' +
      '`replacement` value it gives back, not the name you had in mind.',
    input_schema: {
      type: 'object',
      properties: {
        current_exercise_name: { type: 'string', description: 'Exact catalog name of the exercise to replace.' },
        replacement_exercise_name: {
          type: 'string',
          description:
            'Exact catalog name the user asked to swap TO. Required whenever they named one. If it is ' +
            'not a valid same-pattern option, or is unsafe for their injuries, nothing is changed and ' +
            'you get back the safe alternatives to offer them.',
        },
      },
      required: ['current_exercise_name'],
    },
  },
  {
    name: 'skip_exercise',
    description:
      "ABANDON the current exercise before it is finished, at the user's request, and move to the next one without logging a set for it. NEVER call this to advance after a final set: the app moves to the next exercise BY ITSELF the moment the last set is logged, so calling it there skips an entire exercise and misfiles the set the user is reporting — confirmed live, Hip Thrust was left at 3 of 4 and the user's fourth set landed on Leg Curl. If the user has just reported the last set, say nothing about skipping and call no tool; the app has already moved on. Call this for explicit \"skip\"/\"next exercise\" wording, AND for phrases that name a different, later exercise in the session instead of the current one — e.g. \"let's start dumbbell press\" or \"let's do overhead press now\" while bench press is still current — confirmed live: agreeing to that verbally without calling this leaves the app still showing the old exercise as current, out of sync with what you just said. Only works while a session is actually running in the app, and only advances to the exercise that's actually next in this session — never to an arbitrary exercise the user names that isn't queued up.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'go_to_exercise',
    description:
      "Move the running workout to a SPECIFIC exercise the user names, forward or backward in the " +
      "session. This is the right tool whenever they name one — \"go back to pushdowns\", \"I'm doing " +
      "tricep pushdowns now\", \"let's jump to hammer curls\" — because skip_exercise only ever steps " +
      "one place forward and will land on the wrong exercise if the one they named is further along " +
      "or already behind them. Confirmed live: the user asked for Cable Tricep Pushdown, skip_exercise " +
      "advanced to Hammer Curl instead, and there was then no way back to the exercise they actually " +
      "wanted. Use skip_exercise only for a bare \"skip this\"/\"next one\" with no exercise named. " +
      "Going back to an earlier exercise keeps every set already logged on it; the user simply " +
      "continues from where they left off.",
    input_schema: {
      type: 'object',
      properties: {
        exercise_name: {
          type: 'string',
          description:
            "The exercise to move to, as it appears in this session's live state block. If the user's " +
            'wording matches none of them, do not guess — call this with your best reading and the ' +
            "tool will return the session's real exercise list to ask them with.",
        },
      },
      required: ['exercise_name'],
    },
  },
  {
    name: 'add_set',
    description:
      "Add one extra set to the current exercise in the user's active in-app workout session (e.g. \"let's do one more set of this\"). Only works while a session is actually running in the app.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'log_live_set',
    description:
      "Record one COMPLETED set into the user's active in-app workout when the app has not already " +
      'recorded it itself. Never guess whether the app logged something: every turn during a workout ' +
      'carries a "What the app did with THIS message" note that says exactly that. If the note says ' +
      'the app LOGGED the message, never call this. If it says NOTHING was logged and the user told you ' +
      'they finished a set with a rep count, call this; if they gave no rep count, ask for it first. ' +
      'Only tell them the set is logged or that rest has started once this returns "logged". ' +
      'NEVER call it for a user counting their reps out loud mid-set ("one, two, three... four, five" ' +
      'is counting, not a report, and logging it ends their set early — confirmed live), for a weight ' +
      'they are about to use, for a set you merely announced, or for a set already in the live state ' +
      'block. If you are unsure whether they finished, ask instead of calling this.',
    input_schema: {
      type: 'object',
      properties: {
        reps: { type: 'number', description: 'Reps completed, or seconds held for a timed exercise.' },
        weight: {
          type: 'number',
          description: 'Weight lifted, in the unit given by weight_unit. Omit for a bodyweight movement.',
        },
        weight_unit: { type: 'string', enum: ['kg', 'lb'], description: 'Unit of `weight`.' },
        timed: { type: 'boolean', description: 'True when `reps` is a hold in seconds, not a rep count.' },
      },
      required: ['reps'],
    },
  },
  {
    name: 'undo_last_set',
    description:
      "Remove the most recently logged set in the user's active in-app workout session — use when " +
      'they say the last one was wrong, misheard, or shouldn\'t have been logged (e.g. "that\'s ' +
      'wrong, undo that" or "I didn\'t say that"). Removes only the single most recent set, and ' +
      'works whether or not rest is still running. Only say it was removed once this returns ' +
      '"undone"; then ask for the correct numbers.',
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
        reason: {
          type: 'string',
          description:
            'Why it is ending, in the user\'s own terms — "the bench was taken and the swap did not ' +
            'apply", "shoulder started hurting", "ran out of time". Required whenever completed is ' +
            'false. This is what the session report shows them afterwards, so if you leave it out the ' +
            'report has no reason to give and the user is asked to explain something you already knew. ' +
            'Never ask them to re-state a reason they have already given you in this conversation.',
        },
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
    name: 'discard_workout',
    description:
      'Throw away the workout running in the app right now: nothing from it is saved, every set logged ' +
      'in it is deleted, and the app returns to Home. For "drop it", "scrap this workout", "delete this ' +
      'session", "don\'t save it". NOT for stopping early and keeping what they did (that is end_workout). ' +
      'Call WITHOUT confirm first — it returns what would be deleted and changes nothing. Only call again ' +
      'with confirm:true and the exact confirm_token once they explicitly agree. Never say the workout was ' +
      'cleared, dropped or deleted unless this returns "discarded".',
    input_schema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Leave false/omitted to preview with nothing deleted. Set true only after explicit agreement.',
        },
        confirm_token: {
          type: 'string',
          description: 'Required alongside confirm:true — the exact confirm_token the preview call returned.',
        },
      },
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
