// Real Supabase-backed tool handlers — the brain's actual read/write layer. Every plan-mutating
// handler re-checks docs/coaching-brain.md's safety invariant: nothing persists unless
// injury-validator says it's safe. Untestable without a live Supabase project (paused as of
// 2026-07-23); the orchestration loop itself is unit-tested with fakes in
// ../_shared/brain-orchestrator.test.ts.

import { validatePlan, explainViolations, forbiddenTags, type Injury } from './injury-validator.ts';
import { computeNutritionTargets, type GoalObjective } from './nutrition.ts';
import { resolveTodaySession, nowInTimezone, logsInTimezone } from './brain-context.ts';
import type { ToolHandlers } from './brain-orchestrator.ts';

async function writeAppAction(supabase: any, userId: string, type: string, payload: Record<string, unknown>) {
  const { error } = await supabase.from('app_action').insert({ user_id: userId, type, payload });
  if (error) throw new Error(`app_action insert: ${error.message}`);
}

async function fetchActiveInjuries(supabase: any, userId: string): Promise<Injury[]> {
  const { data, error } = await supabase
    .from('injury')
    .select('area,status')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (error) throw new Error(`fetch injuries: ${error.message}`);
  return data ?? [];
}

async function resolveExercises(supabase: any, names: string[]) {
  const { data, error } = await supabase.from('exercise').select('id,name,contraindicated_for').in('name', names);
  if (error) throw new Error(`resolve exercises: ${error.message}`);
  const byName = new Map<string, { id: string; contraindicated_for: string[] }>();
  for (const row of data ?? []) byName.set(row.name, row);
  return byName;
}

async function writePlan(supabase: any, userId: string, plan: any) {
  const names = plan.sessions.flatMap((s: any) => s.exercises.map((e: any) => e.name));
  const [injuries, exerciseByName] = await Promise.all([
    fetchActiveInjuries(supabase, userId),
    resolveExercises(supabase, names),
  ]);

  const exercisesForValidator = names.map((name: string) => ({
    name,
    contraindicatedFor: exerciseByName.get(name)?.contraindicated_for ?? [],
  }));
  const violations = validatePlan(exercisesForValidator, injuries);
  if (violations.length > 0) throw new Error(explainViolations(violations));

  for (const name of names) {
    if (!exerciseByName.has(name)) throw new Error(`Unknown exercise "${name}" — not in the catalog.`);
  }

  await supabase.from('training_plan').update({ status: 'archived' }).eq('user_id', userId).eq('status', 'active');

  const { data: planRow, error: planError } = await supabase
    .from('training_plan')
    .insert({ user_id: userId, split: plan.split, days_per_week: plan.days_per_week })
    .select()
    .single();
  if (planError) throw new Error(`training_plan insert: ${planError.message}`);

  for (const session of plan.sessions) {
    const { data: sessionRow, error: sessionError } = await supabase
      .from('plan_session')
      .insert({
        plan_id: planRow.id,
        user_id: userId,
        day_order: session.day_order,
        weekday: session.weekday ?? null,
        focus: session.focus,
      })
      .select()
      .single();
    if (sessionError) throw new Error(`plan_session insert: ${sessionError.message}`);

    const rows = session.exercises.map((e: any, ord: number) => ({
      session_id: sessionRow.id,
      user_id: userId,
      exercise_id: exerciseByName.get(e.name)!.id,
      ord,
      sets: e.sets,
      rep_scheme: e.rep_scheme,
      load_scheme: e.load_scheme ?? null,
    }));
    const { error: exError } = await supabase.from('plan_exercise').insert(rows);
    if (exError) throw new Error(`plan_exercise insert: ${exError.message}`);
  }

  return { status: 'persisted', plan_id: planRow.id, split: plan.split, days_per_week: plan.days_per_week };
}

async function writeNutritionTargets(supabase: any, userId: string, goal: GoalObjective) {
  const { data: weightRow, error: weightError } = await supabase
    .from('weight_log')
    .select('weight_kg')
    .eq('user_id', userId)
    .order('measured_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (weightError) throw new Error(`weight_log fetch: ${weightError.message}`);
  if (!weightRow) throw new Error('No weight on file yet — ask for it before setting nutrition targets.');

  const { data: priorGoal } = await supabase
    .from('goal')
    .select('objective')
    .eq('user_id', userId)
    .maybeSingle();

  const targets = computeNutritionTargets(weightRow.weight_kg, goal);

  const { error: targetError } = await supabase.from('nutrition_target').upsert({
    user_id: userId,
    derived_from_goal: goal,
    ...targets,
  });
  if (targetError) throw new Error(`nutrition_target upsert: ${targetError.message}`);

  const { error: goalError } = await supabase.from('goal').upsert({ user_id: userId, objective: goal });
  if (goalError) console.error('[brain] goal upsert:', goalError.message);
  const { error: historyError } = await supabase
    .from('goal_history')
    .insert({ user_id: userId, objective: goal });
  if (historyError) console.error('[brain] goal_history insert:', historyError.message);

  // Change the goal and both plans move (docs/coaching-brain.md). Stating that in the system
  // prompt alone was not enough — the model set new targets and left the training plan alone —
  // so the requirement is returned with the result, the same way record_injury drives its
  // follow-up call after the validator rejects a plan.
  const previous = priorGoal?.objective;
  if (previous && previous !== goal) {
    return {
      status: 'persisted',
      ...targets,
      goal_changed: { from: previous, to: goal },
      instruction:
        `The goal changed from ${previous} to ${goal}. Training and nutrition move together — ` +
        'call update_training_plan now with a plan that suits the new goal, before replying.',
    };
  }

  return { status: 'persisted', ...targets };
}

export function createHandlers(supabase: any, userId: string): ToolHandlers {
  return {
    read_state: async (input) => {
      const scope: string[] = input.scope ?? [];
      const out: Record<string, any> = {};

      if (scope.includes('profile')) {
        out.profile = (await supabase.from('profile').select('*').eq('user_id', userId).maybeSingle()).data;
        out.biometrics = (await supabase.from('biometrics').select('*').eq('user_id', userId).maybeSingle()).data;
      }
      if (scope.includes('plan')) {
        out.plan = (
          await supabase
            .from('training_plan')
            .select('*, plan_session(*, plan_exercise(*, exercise(name)))')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle()
        ).data;

        // The raw plan_session list has no notion of "current position in a flexible
        // rotation" — without this, the model has been observed picking day_order 1 (the
        // first session listed) and describing it as "today's"/"queued up" regardless of
        // how far into the rotation the user actually is, even right after completing it.
        const sessions = out.plan?.plan_session ?? [];
        if (sessions.length > 0) {
          const [{ data: profile }, { data: recentLogs }] = await Promise.all([
            supabase.from('profile').select('timezone').eq('user_id', userId).maybeSingle(),
            supabase
              .from('workout_log')
              .select('at, plan_session_id, status')
              .eq('user_id', userId)
              .order('at', { ascending: false })
              .limit(10),
          ]);
          const nextSession = resolveTodaySession(
            sessions,
            logsInTimezone(recentLogs ?? [], profile?.timezone),
            nowInTimezone(profile?.timezone),
          );
          out.next_session_to_train = nextSession
            ? {
                plan_session_id: nextSession.id,
                focus: nextSession.focus,
                instruction:
                  'This is the only session that is due — never describe a different plan_session as "today\'s", "queued up", or "next" instead of this one.',
              }
            : {
                plan_session_id: null,
                focus: null,
                instruction:
                  'Nothing is due right now (already trained today, or today is a rest day) — do not name any specific plan_session as due.',
              };
        }
      }
      if (scope.includes('nutrition')) {
        out.nutrition_target = (
          await supabase.from('nutrition_target').select('*').eq('user_id', userId).maybeSingle()
        ).data;
      }
      if (scope.includes('injuries')) {
        out.injuries = await fetchActiveInjuries(supabase, userId);
      }
      if (scope.includes('recent_messages')) {
        out.recent_messages = (
          await supabase
            .from('message')
            .select('role,content,at')
            .eq('user_id', userId)
            .order('at', { ascending: false })
            .limit(10)
        ).data;
      }
      if (scope.includes('recent_logs')) {
        out.recent_food = (
          await supabase.from('food_log').select('*').eq('user_id', userId).order('at', { ascending: false }).limit(10)
        ).data;
        out.recent_workouts = (
          await supabase
            .from('workout_log')
            .select('*')
            .eq('user_id', userId)
            .order('at', { ascending: false })
            .limit(10)
        ).data;
      }

      return out;
    },

    generate_training_plan: (input) => writePlan(supabase, userId, input),
    update_training_plan: (input) => writePlan(supabase, userId, input),

    generate_nutrition_targets: (input) => writeNutritionTargets(supabase, userId, input.goal),
    update_nutrition_targets: (input) => writeNutritionTargets(supabase, userId, input.goal),

    record_injury: async (input) => {
      const { error } = await supabase
        .from('injury')
        .insert({ user_id: userId, area: input.area, severity: input.severity ?? null, note: input.note ?? null });
      if (error) throw new Error(`injury insert: ${error.message}`);

      const injuries = await fetchActiveInjuries(supabase, userId);
      const { data: activePlan } = await supabase
        .from('training_plan')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (!activePlan) return { status: 'recorded', plan_check: 'no_active_plan' };

      // Scoped to the active plan on purpose: archiving a plan leaves its plan_session and
      // plan_exercise rows in place, so a user_id-only lookup validates exercises the user no
      // longer trains and reports a safe plan as unsafe.
      const { data: planExercises } = await supabase
        .from('plan_exercise')
        .select('exercise:exercise_id(name, contraindicated_for), plan_session!inner(plan_id)')
        .eq('user_id', userId)
        .eq('plan_session.plan_id', activePlan.id);
      const exercisesForValidator = (planExercises ?? []).map((row: any) => ({
        name: row.exercise.name,
        contraindicatedFor: row.exercise.contraindicated_for ?? [],
      }));
      const violations = validatePlan(exercisesForValidator, injuries);

      if (violations.length > 0) {
        return {
          status: 'recorded',
          plan_check: 'now_unsafe',
          violations: explainViolations(violations),
          instruction: 'Call update_training_plan now to replace the unsafe exercises.',
        };
      }
      return { status: 'recorded', plan_check: 'still_safe' };
    },

    log_food: async (input) => {
      const { error } = await supabase.from('food_log').insert({ user_id: userId, ...input });
      if (error) throw new Error(`food_log insert: ${error.message}`);
      return { status: 'logged' };
    },

    log_workout: async (input) => {
      const { error } = await supabase.from('workout_log').insert({
        user_id: userId,
        plan_session_id: input.plan_session_id ?? null,
        exercises_done: input.exercises_done,
        note: input.note ?? null,
      });
      if (error) throw new Error(`workout_log insert: ${error.message}`);
      return { status: 'logged' };
    },

    log_checkin: async (input) => {
      const { error } = await supabase.from('checkin_log').insert({ user_id: userId, ...input });
      if (error) throw new Error(`checkin_log insert: ${error.message}`);

      // A reported weight also belongs in the weight_log series: that is what the trend reads and
      // what writeNutritionTargets recomputes from. Without this every future target derives from
      // the onboarding weight no matter how many times the user weighs in.
      if (typeof input.weight_kg === 'number') {
        const { error: weightError } = await supabase
          .from('weight_log')
          .insert({ user_id: userId, weight_kg: input.weight_kg });
        if (weightError) console.error('[brain] weight_log insert:', weightError.message);
      }

      return { status: 'logged' };
    },

    open_screen: async (input) => {
      await writeAppAction(supabase, userId, 'navigate', { screen: input.screen });
      return { status: 'opened', screen: input.screen };
    },

    open_todays_workout: async () => {
      const { data: activePlan } = await supabase
        .from('training_plan')
        .select('plan_session(id, day_order, weekday, focus)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      const sessions = activePlan?.plan_session ?? [];
      if (sessions.length === 0) return { status: 'no_session', reason: 'no_active_plan' };

      const [{ data: profile }, { data: recentLogs }] = await Promise.all([
        supabase.from('profile').select('timezone').eq('user_id', userId).maybeSingle(),
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
      ]);

      const today = resolveTodaySession(
        sessions,
        logsInTimezone(recentLogs ?? [], profile?.timezone),
        nowInTimezone(profile?.timezone),
      );
      if (!today) return { status: 'no_session', reason: 'rest_day' };

      await writeAppAction(supabase, userId, 'navigate', {
        screen: 'PreWorkoutPreview',
        params: { planSessionId: today.id },
      });
      return { status: 'opened', plan_session_id: today.id, focus: today.focus };
    },

    show_plan_breakdown: async () => {
      const { data: plan, error } = await supabase
        .from('training_plan')
        .select(
          'id, split, days_per_week, plan_session(id, day_order, weekday, focus, plan_exercise(ord, exercise(name)))',
        )
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw new Error(`training_plan fetch: ${error.message}`);
      if (!plan) return { status: 'no_plan' };

      const days = (plan.plan_session ?? [])
        .slice()
        .sort((a: any, b: any) => a.day_order - b.day_order)
        .map((session: any) => ({
          plan_session_id: session.id,
          day_order: session.day_order,
          focus: session.focus,
          exercises: (session.plan_exercise ?? [])
            .slice()
            .sort((a: any, b: any) => a.ord - b.ord)
            .map((e: any) => e.exercise?.name)
            .filter(Boolean),
        }));

      return {
        status: 'shown',
        card: {
          type: 'plan_breakdown',
          split: plan.split,
          days_per_week: plan.days_per_week,
          days,
        },
      };
    },

    swap_exercise: async (input) => {
      const { data: current } = await supabase
        .from('exercise')
        .select('id, movement_pattern')
        .ilike('name', input.current_exercise_name)
        .maybeSingle();
      if (!current?.movement_pattern) return { status: 'not_found' };

      const injuries = await fetchActiveInjuries(supabase, userId);
      const forbidden = forbiddenTags(injuries);

      const { data: candidates } = await supabase
        .from('exercise')
        .select('id, name, contraindicated_for')
        .eq('movement_pattern', current.movement_pattern)
        .neq('id', current.id);

      const safe = (candidates ?? []).find(
        (c: any) => !(c.contraindicated_for ?? []).some((tag: string) => forbidden.has(tag)),
      );
      if (!safe) return { status: 'no_safe_alternative' };

      await writeAppAction(supabase, userId, 'swap_exercise', {
        from_name: input.current_exercise_name,
        to_exercise_id: safe.id,
        to_name: safe.name,
      });
      return { status: 'requested', replacement: safe.name };
    },

    skip_exercise: async () => {
      await writeAppAction(supabase, userId, 'skip_exercise', {});
      return { status: 'requested' };
    },

    end_workout: async (input) => {
      await writeAppAction(supabase, userId, 'end_workout', { status: input.completed ? 'completed' : 'partial' });
      return { status: 'requested' };
    },

    update_profile: async (input) => {
      const { error } = await supabase
        .from('profile')
        .update({ display_name: input.display_name })
        .eq('user_id', userId);
      if (error) throw new Error(`profile update: ${error.message}`);
      return { status: 'updated', display_name: input.display_name };
    },
  };
}
