// Real Supabase-backed tool handlers — the brain's actual read/write layer. Every plan-mutating
// handler re-checks docs/coaching-brain.md's safety invariant: nothing persists unless
// injury-validator says it's safe. Untestable without a live Supabase project (paused as of
// 2026-07-23); the orchestration loop itself is unit-tested with fakes in
// ../_shared/brain-orchestrator.test.ts.

import { validatePlan, explainViolations, type Injury } from '../_shared/injury-validator.ts';
import { computeNutritionTargets, type GoalObjective } from '../_shared/nutrition.ts';
import type { ToolHandlers } from '../_shared/brain-orchestrator.ts';

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

  const targets = computeNutritionTargets(weightRow.weight_kg, goal);

  const { error: targetError } = await supabase.from('nutrition_target').upsert({
    user_id: userId,
    derived_from_goal: goal,
    ...targets,
  });
  if (targetError) throw new Error(`nutrition_target upsert: ${targetError.message}`);

  await supabase.from('goal').upsert({ user_id: userId, objective: goal });
  await supabase.from('goal_history').insert({ user_id: userId, objective: goal });

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
      }
      if (scope.includes('nutrition')) {
        out.nutrition_target = (
          await supabase.from('nutrition_target').select('*').eq('user_id', userId).maybeSingle()
        ).data;
      }
      if (scope.includes('injuries')) {
        out.injuries = await fetchActiveInjuries(supabase, userId);
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

      const { data: planExercises } = await supabase
        .from('plan_exercise')
        .select('exercise:exercise_id(name, contraindicated_for)')
        .eq('user_id', userId);
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
      return { status: 'logged' };
    },
  };
}
