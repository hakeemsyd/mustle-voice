// Real Supabase-backed tool handlers — the brain's actual read/write layer. Every plan-mutating
// handler re-checks docs/coaching-brain.md's safety invariant: nothing persists unless
// injury-validator says it's safe. Untestable without a live Supabase project (paused as of
// 2026-07-23); the orchestration loop itself is unit-tested with fakes in
// ../_shared/brain-orchestrator.test.ts.

import { validatePlan, explainViolations, forbiddenTags, type Injury } from './injury-validator.ts';
import { computeNutritionTargets, type GoalObjective } from './nutrition.ts';
import { resolveTodaySession, nowInTimezone, logsInTimezone, toTimezone } from './brain-context.ts';
import type { ToolHandlers } from './brain-orchestrator.ts';

const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
// Corrections happen within the same conversation, minutes apart — not hours. A second,
// unrelated meal with overlapping words (e.g. eggs at breakfast and eggs at dinner) should
// still log as its own entry, so this window is short enough to only catch same-sitting
// corrections, not flag every repeat meal in a day.
const CORRECTION_WINDOW_MS = 45 * 60 * 1000;

const STOP_WORDS = new Set(['and', 'with', 'a', 'an', 'the', 'some', 'of', 'for', 'my', 'plus', 'about', 'ish']);

// Mirrors src/lib/restSuggestion.ts's estimateRestSeconds/targetRepsFrom — duplicated here since
// the edge function runs in a separate Deno runtime from the RN app. Rest duration isn't stored
// per plan_exercise (no such column), so show_daily_workout estimates it the same way Active
// Session does before any set has actually been logged.
function targetRepsFrom(repScheme: string): number | null {
  const numbers = repScheme.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  return Math.max(...numbers.map(Number));
}
function estimateRestSeconds(repScheme: string | null): number {
  const target = repScheme ? targetRepsFrom(repScheme) : null;
  if (target === null) return 90;
  if (target <= 6) return 150;
  if (target <= 12) return 90;
  return 60;
}
function humanizeFocus(focus: string | null): string {
  if (!focus) return 'Training';
  return focus
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// ── Stats snapshot — mirrors src/hooks/useStatsData.ts's formulas exactly (performance score,
// readiness, top lifts, volume) so these chat cards never disagree with what the Stats tab
// itself shows. Duplicated here for the same cross-runtime reason as estimateRestSeconds above.
function parseCsvNumbers(value: string): number[] {
  return value
    .split(',')
    .map((v) => parseFloat(v))
    .filter((v) => Number.isFinite(v));
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

interface WorkoutLogRow {
  at: string;
  status: string;
  exercises_done: { name: string; reps: string; load: string }[];
}

async function computeStatsSnapshot(supabase: any, userId: string, timezone: string | null) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const [{ data: plan }, { data: workoutRows }, { data: foodRows }, { data: nutrition }] = await Promise.all([
    supabase
      .from('training_plan')
      .select('days_per_week, plan_session(weekday)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('workout_log')
      .select('at, status, exercises_done')
      .eq('user_id', userId)
      .gte('at', ninetyDaysAgo.toISOString())
      .order('at', { ascending: false }),
    supabase
      .from('food_log')
      .select('calories, protein_g, carbs_g, fat_g, at')
      .eq('user_id', userId)
      .gte('at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
    supabase.from('nutrition_target').select('calories, protein_g, carbs_g, fat_g').eq('user_id', userId).maybeSingle(),
  ]);

  const workouts = (workoutRows ?? []) as WorkoutLogRow[];
  const now = timezone ? toTimezone(new Date(), timezone) : new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);

  const pinnedWeekdays = new Set(
    (plan?.plan_session ?? []).map((s: any) => s.weekday).filter((w: number | null) => w !== null),
  );
  const planned = plan?.days_per_week ?? pinnedWeekdays.size;

  let completedThisWeek = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (workouts.some((w) => w.status !== 'partial' && dayKey(new Date(w.at)) === dayKey(d))) completedThisWeek++;
  }
  let completedLastWeek = 0;
  for (let i = 13; i >= 7; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (workouts.some((w) => w.status !== 'partial' && dayKey(new Date(w.at)) === dayKey(d))) completedLastWeek++;
  }
  const completionPct = planned > 0 ? Math.min(100, Math.round((completedThisWeek / planned) * 100)) : 0;
  const prevCompletionPct = planned > 0 ? Math.min(100, Math.round((completedLastWeek / planned) * 100)) : 0;

  const workoutDays = new Set(workouts.filter((w) => w.status !== 'partial').map((w) => dayKey(new Date(w.at))));
  let streakDays = 0;
  const cursor = new Date(now);
  if (!workoutDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (workoutDays.has(dayKey(cursor))) {
    streakDays++;
    cursor.setDate(cursor.getDate() - 1);
  }

  function volumeFor(rows: WorkoutLogRow[]): number {
    let total = 0;
    for (const w of rows) {
      for (const ex of w.exercises_done ?? []) {
        const loads = parseCsvNumbers(ex.load);
        const reps = parseCsvNumbers(ex.reps);
        const n = Math.min(loads.length, reps.length);
        for (let i = 0; i < n; i++) total += loads[i] * reps[i];
      }
    }
    return Math.round(total);
  }
  const thisWeekWorkouts = workouts.filter((w) => new Date(w.at) >= weekAgo);
  const weeklyVolumeLb = volumeFor(thisWeekWorkouts);
  const lastWeekVolumeLb = volumeFor(workouts.filter((w) => new Date(w.at) >= twoWeeksAgo && new Date(w.at) < weekAgo));
  const volumeDeltaPct = lastWeekVolumeLb > 0 ? Math.round(((weeklyVolumeLb - lastWeekVolumeLb) / lastWeekVolumeLb) * 100) : null;

  const byExercise = new Map<string, number[]>();
  for (const w of workouts.slice().reverse()) {
    for (const ex of w.exercises_done ?? []) {
      const loads = parseCsvNumbers(ex.load);
      if (loads.length === 0) continue;
      const arr = byExercise.get(ex.name) ?? [];
      arr.push(Math.max(...loads));
      byExercise.set(ex.name, arr);
    }
  }
  const topLifts = Array.from(byExercise.entries())
    .map(([name, weights]) => ({ name, top_weight_lb: Math.max(...weights) }))
    .sort((a, b) => b.top_weight_lb - a.top_weight_lb)
    .slice(0, 3);

  const proteinByDay = new Map<string, number>();
  for (const r of foodRows ?? []) {
    const key = dayKey(new Date(r.at));
    proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + (r.protein_g ?? 0));
  }
  const proteinTarget = nutrition?.protein_g ?? 0;
  const proteinDaysHit =
    proteinTarget > 0 ? Array.from(proteinByDay.values()).filter((p) => p >= proteinTarget).length : 0;
  const proteinAdherencePct = proteinTarget > 0 ? Math.round((proteinDaysHit / 7) * 100) : 0;

  const hasTrainingData = workouts.length > 0;
  const volumeTrendScore = volumeDeltaPct == null ? 50 : volumeDeltaPct >= 0 ? 70 : 30;
  const performanceScore = hasTrainingData
    ? Math.round(completionPct * 0.5 + proteinAdherencePct * 0.3 + volumeTrendScore * 0.2)
    : 0;

  const performanceTrend: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayEnd = new Date(now);
    dayEnd.setDate(dayEnd.getDate() - i);
    const windowStart = new Date(dayEnd);
    windowStart.setDate(windowStart.getDate() - 6);
    const completedInWindow = workouts.filter(
      (w) => w.status !== 'partial' && new Date(w.at) >= windowStart && new Date(w.at) <= dayEnd,
    ).length;
    performanceTrend.push(planned > 0 ? Math.min(100, Math.round((completedInWindow / planned) * 100)) : 0);
  }

  const daysSinceLast = workouts.length > 0 ? Math.floor((now.getTime() - new Date(workouts[0].at).getTime()) / 86_400_000) : 99;
  let readinessScore = 75;
  if (daysSinceLast === 0) readinessScore -= 10;
  if (daysSinceLast >= 1) readinessScore += 10;
  if (streakDays >= 4) readinessScore -= 10;
  readinessScore = Math.max(0, Math.min(100, readinessScore));
  const readinessLabel =
    readinessScore >= 80 ? 'Ready to train' : readinessScore >= 60 ? 'Train at normal effort' : 'Train with caution';

  function readinessAt(asOf: Date): number {
    const completed = workouts.filter((w) => w.status !== 'partial' && new Date(w.at) <= asOf);
    const daysSince =
      completed.length > 0 ? Math.floor((asOf.getTime() - new Date(completed[0].at).getTime()) / 86_400_000) : 99;
    const days = new Set(completed.map((w) => dayKey(new Date(w.at))));
    let streak = 0;
    const cursor = new Date(asOf);
    if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(dayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    let score = 75;
    if (daysSince === 0) score -= 10;
    if (daysSince >= 1) score += 10;
    if (streak >= 4) score -= 10;
    return Math.max(0, Math.min(100, score));
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const readinessScoreYesterday = readinessAt(yesterday);
  const readinessTrendLabel =
    readinessScore > readinessScoreYesterday + 5 ? 'Up' : readinessScore < readinessScoreYesterday - 5 ? 'Down' : 'Steady';

  const foodRowsToday = (foodRows ?? []).filter((r: any) => new Date(r.at) >= startOfDay);
  const caloriesToday = foodRowsToday.reduce((sum: number, r: any) => sum + (r.calories ?? 0), 0);
  const proteinToday = foodRowsToday.reduce((sum: number, r: any) => sum + (r.protein_g ?? 0), 0);

  return {
    performanceScore,
    performanceTrend,
    completionPct,
    prevCompletionPct,
    readinessScore,
    readinessLabel,
    readinessTrendLabel,
    topLifts,
    caloriesLeft: Math.max(0, Math.round((nutrition?.calories ?? 0) - caloriesToday)),
    caloriesTarget: nutrition?.calories ?? 0,
    proteinToday: Math.round(proteinToday),
    macroTargets: [
      { label: 'Protein', target: nutrition?.protein_g ?? 0, unit: 'g' },
      { label: 'Carbs', target: nutrition?.carbs_g ?? 0, unit: 'g' },
      { label: 'Fat', target: nutrition?.fat_g ?? 0, unit: 'g' },
    ],
  };
}

export function significantWords(text: string): Set<string> {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w)),
  );
}

// Confirmed live: a correction ("actually make that 4 egg whites") reaches log_food with
// different numbers than the original, so an exact-match check lets it straight through and
// creates a second row for the same meal. This catches "same meal, re-described" by word
// overlap instead of requiring byte-identical values.
export function looksLikeSameMeal(a: string, b: string): boolean {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  const union = new Set([...wa, ...wb]).size;
  return shared / union >= 0.4;
}

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

  const rpcPlan = {
    split: plan.split,
    days_per_week: plan.days_per_week,
    sessions: plan.sessions.map((session: any) => ({
      day_order: session.day_order,
      weekday: session.weekday ?? null,
      focus: session.focus,
      exercises: session.exercises.map((e: any) => ({
        exercise_id: exerciseByName.get(e.name)!.id,
        sets: e.sets,
        rep_scheme: e.rep_scheme,
        load_scheme: e.load_scheme ?? null,
      })),
    })),
  };

  // A single RPC call so archive-old + insert-new-plan + insert-sessions + insert-exercises all
  // commit or roll back together — see write_training_plan in the migrations, this replaced a
  // sequence of separate client-side inserts that could leave no active plan on a mid-way failure.
  const { data: planId, error: rpcError } = await supabase.rpc('write_training_plan', {
    p_user_id: userId,
    p_plan: rpcPlan,
  });
  if (rpcError) throw new Error(`write_training_plan: ${rpcError.message}`);

  return { status: 'persisted', plan_id: planId, split: plan.split, days_per_week: plan.days_per_week };
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

async function resolveTimezone(supabase: any, userId: string, requestTimezone?: string | null): Promise<string | null> {
  if (requestTimezone) return requestTimezone;
  const { data } = await supabase.from('profile').select('timezone').eq('user_id', userId).maybeSingle();
  return data?.timezone ?? null;
}

export function createHandlers(supabase: any, userId: string, requestTimezone?: string | null): ToolHandlers {
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
        // rotation" — the model has been observed picking a day other than the one actually
        // due (day_order 1, or some other session entirely) and describing it as "today's"
        // despite an explicit instruction not to, whenever the full plan (with every other
        // session's exercises spelled out right next to it) was also in the same result.
        // Wording the instruction more strongly didn't fix it — confirmed live, a fresh
        // greeting still picked a different day's exercises verbatim. The fix that actually
        // works is structural: strip exercise-level detail from every session EXCEPT the one
        // that's due, so there is no other session's exercise list for the model to reach for.
        // (Full per-day detail for "show me my whole week" goes through show_plan_breakdown,
        // which fetches its own copy — this scope is only ever for "what's next.")
        const sessions = out.plan?.plan_session ?? [];
        if (sessions.length > 0) {
          const [timezone, { data: recentLogs }] = await Promise.all([
            resolveTimezone(supabase, userId, requestTimezone),
            supabase
              .from('workout_log')
              .select('at, plan_session_id, status')
              .eq('user_id', userId)
              .order('at', { ascending: false })
              .limit(10),
          ]);
          const nextSession = resolveTodaySession(
            sessions,
            logsInTimezone(recentLogs ?? [], timezone),
            nowInTimezone(timezone),
          );
          out.next_session_to_train = nextSession
            ? {
                plan_session_id: nextSession.id,
                focus: nextSession.focus,
                exercises: (nextSession.plan_exercise ?? [])
                  .slice()
                  .sort((a: any, b: any) => a.ord - b.ord)
                  .map((e: any) => ({
                    name: e.exercise?.name,
                    sets: e.sets,
                    rep_scheme: e.rep_scheme,
                    load_scheme: e.load_scheme,
                  })),
                instruction:
                  'This is the only session that is due, and its exercises above are the only ones to name ' +
                  'when describing "today\'s"/"next" workout — never name an exercise from a different ' +
                  'plan_session below, even if it looks plausible.',
              }
            : {
                plan_session_id: null,
                focus: null,
                instruction:
                  'Nothing is due right now (already trained today, or today is a rest day) — do not name any specific plan_session or its exercises as due.',
              };

          // Strip other sessions down to id/day_order/focus — the due session's exercises are
          // already duplicated above; leaving every other session's full exercise list sitting
          // right next to next_session_to_train is exactly what caused this to keep happening.
          out.plan = {
            ...out.plan,
            plan_session: sessions.map((s: any) =>
              s.id === nextSession?.id ? s : { id: s.id, day_order: s.day_order, weekday: s.weekday, focus: s.focus },
            ),
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
        const [timezone, { data: foodRows }] = await Promise.all([
          resolveTimezone(supabase, userId, requestTimezone),
          supabase.from('food_log').select('*').eq('user_id', userId).order('at', { ascending: false }).limit(15),
        ]);

        // Raw ISO timestamps forced the model to do its own UTC-to-local mental math to decide
        // what counts as "today" — confirmed live: it pulled a two-day-old meal into today's
        // total. Doing that conversion here and labeling each row explicitly removes the guess.
        const todayLocal = nowInTimezone(timezone).toISOString().slice(0, 10);
        out.recent_food = {
          today_date: todayLocal,
          instruction:
            'Only rows with is_today=true count toward today\'s intake — never include an earlier ' +
            'local_date in today\'s total, and never invent a total yourself: sum exactly these rows.',
          entries: (foodRows ?? []).map((row: any) => {
            const localDate = toTimezone(new Date(row.at), timezone).toISOString().slice(0, 10);
            return { ...row, local_date: localDate, is_today: localDate === todayLocal };
          }),
        };
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
      // Two distinct guards. (1) Exact-match retry protection: a retry/reconnect/repeated tool
      // call logging the byte-identical meal within minutes — confirmed live, five identical
      // rows back to back. (2) Correction detection: confirmed live separately — a correction
      // ("actually make that 4 egg whites, not 6") has DIFFERENT numbers, so (1) alone lets it
      // straight through and creates a second row for the same meal. Widening the lookback and
      // matching on description word-overlap catches that case without persisting anything.
      const sinceCorrectionIso = new Date(Date.now() - CORRECTION_WINDOW_MS).toISOString();
      const { data: recent } = await supabase
        .from('food_log')
        .select('id, description, calories, protein_g, carbs_g, fat_g, at')
        .eq('user_id', userId)
        .gte('at', sinceCorrectionIso)
        .order('at', { ascending: false });

      const sinceExactMs = Date.now() - DUPLICATE_WINDOW_MS;
      const exactDuplicate = (recent ?? []).find(
        (row: any) =>
          new Date(row.at).getTime() >= sinceExactMs &&
          String(row.description ?? '').trim().toLowerCase() === String(input.description ?? '').trim().toLowerCase() &&
          (row.calories ?? null) === (input.calories ?? null) &&
          (row.protein_g ?? null) === (input.protein_g ?? null) &&
          (row.carbs_g ?? null) === (input.carbs_g ?? null) &&
          (row.fat_g ?? null) === (input.fat_g ?? null),
      );
      if (exactDuplicate) return { status: 'already_logged', id: exactDuplicate.id };

      const nearDuplicate = (recent ?? []).find((row: any) => looksLikeSameMeal(row.description, input.description));
      if (nearDuplicate) {
        return {
          status: 'likely_correction',
          id: nearDuplicate.id,
          existing: {
            description: nearDuplicate.description,
            calories: nearDuplicate.calories,
            protein_g: nearDuplicate.protein_g,
            carbs_g: nearDuplicate.carbs_g,
            fat_g: nearDuplicate.fat_g,
          },
          instruction:
            `Nothing was saved — this looks like a correction to "${nearDuplicate.description}", already ` +
            `logged a little earlier, not a new meal. Call update_food with id "${nearDuplicate.id}" instead. ` +
            'If this is genuinely a separate meal eaten again, tell the user you are logging it as a new ' +
            'entry and call log_food again — do not silently retry the same call.',
        };
      }

      const { data, error } = await supabase
        .from('food_log')
        .insert({ user_id: userId, ...input })
        .select('id')
        .single();
      if (error) throw new Error(`food_log insert: ${error.message}`);
      return { status: 'logged', id: data.id };
    },

    update_food: async (input) => {
      const { id, confirm, ...fields } = input;
      if (!id) throw new Error('update_food requires the id from read_state\'s recent_food.');

      // Structural confirm gate: without confirm:true this only previews and never writes, so
      // the model cannot say "done" before the user has actually agreed — confirmed live that
      // prompt instructions alone weren't enough, it called the tool and said done in one turn.
      if (!confirm) {
        const { data: current, error } = await supabase
          .from('food_log')
          .select('id, description, calories, protein_g, carbs_g, fat_g')
          .eq('id', id)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw new Error(`food_log fetch: ${error.message}`);
        if (!current) return { status: 'not_found' };
        return {
          status: 'preview',
          id,
          current,
          proposed: { ...current, ...fields },
          instruction:
            'Nothing is saved yet. Read back exactly what will change and wait for the user to explicitly ' +
            'agree in their next message, then call update_food again with the same fields plus confirm:true.',
        };
      }

      const { data, error } = await supabase
        .from('food_log')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`food_log update: ${error.message}`);
      if (!data) return { status: 'not_found' };
      return { status: 'updated', id };
    },

    delete_food: async (input) => {
      if (!input.id) throw new Error('delete_food requires the id from read_state\'s recent_food.');

      if (!input.confirm) {
        const { data: current, error } = await supabase
          .from('food_log')
          .select('id, description, calories, protein_g, carbs_g, fat_g')
          .eq('id', input.id)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw new Error(`food_log fetch: ${error.message}`);
        if (!current) return { status: 'not_found' };
        return {
          status: 'preview',
          id: input.id,
          current,
          instruction:
            'Nothing is deleted yet. Confirm with the user exactly which meal you are about to remove and ' +
            'wait for explicit agreement, then call delete_food again with confirm:true.',
        };
      }

      const { data, error } = await supabase
        .from('food_log')
        .delete()
        .eq('id', input.id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(`food_log delete: ${error.message}`);
      if (!data) return { status: 'not_found' };
      return { status: 'deleted', id: input.id };
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

      const [timezone, { data: recentLogs }] = await Promise.all([
        resolveTimezone(supabase, userId, requestTimezone),
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
      ]);

      const today = resolveTodaySession(
        sessions,
        logsInTimezone(recentLogs ?? [], timezone),
        nowInTimezone(timezone),
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

    show_daily_workout: async () => {
      const { data: plan, error } = await supabase
        .from('training_plan')
        .select('plan_session(id, day_order, weekday, focus, plan_exercise(ord, sets, rep_scheme, exercise(name)))')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw new Error(`training_plan fetch: ${error.message}`);

      const sessions = plan?.plan_session ?? [];
      if (sessions.length === 0) return { status: 'no_session', reason: 'no_active_plan' };

      const [timezone, { data: recentLogs }] = await Promise.all([
        resolveTimezone(supabase, userId, requestTimezone),
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
      ]);
      const today = resolveTodaySession(sessions, logsInTimezone(recentLogs ?? [], timezone), nowInTimezone(timezone));
      if (!today) return { status: 'no_session', reason: 'rest_day' };

      const exercises = (today.plan_exercise ?? [])
        .slice()
        .sort((a: any, b: any) => a.ord - b.ord)
        .map((e: any) => ({
          name: e.exercise?.name,
          sets: e.sets ?? 1,
          reps: e.rep_scheme ?? '',
          rest_sec: estimateRestSeconds(e.rep_scheme),
        }));

      const estimatedMinutes = Math.round(
        exercises.reduce((total: number, e: any) => total + e.sets * (40 + e.rest_sec), 0) / 60,
      );

      return {
        status: 'shown',
        card: {
          type: 'daily_workout',
          plan_session_id: today.id,
          day_label: `Today · ${humanizeFocus(today.focus)}`,
          estimated_minutes: estimatedMinutes,
          exercises,
        },
      };
    },

    show_nutrition_summary: async () => {
      const snapshot = await computeStatsSnapshot(supabase, userId, await resolveTimezone(supabase, userId, requestTimezone));
      if (snapshot.caloriesTarget === 0) return { status: 'no_targets' };
      const proteinTarget = snapshot.macroTargets.find((m) => m.label === 'Protein')?.target ?? 0;
      const proteinRemaining = Math.max(0, proteinTarget - snapshot.proteinToday);
      const insight =
        proteinTarget === 0
          ? "Log a meal to start tracking today's macros."
          : proteinRemaining <= 0
            ? 'Protein target hit for today — nice work.'
            : snapshot.caloriesLeft <= 0
              ? "You're close to your calorie target for today — keep the rest light."
              : 'Still some room on protein today — a meal with lean protein would close the gap fast.';
      return {
        status: 'shown',
        card: {
          type: 'nutrition_summary',
          calories_left: snapshot.caloriesLeft,
          calories_target: snapshot.caloriesTarget,
          macros: snapshot.macroTargets,
          insight,
        },
      };
    },

    show_progress_report: async () => {
      const snapshot = await computeStatsSnapshot(supabase, userId, await resolveTimezone(supabase, userId, requestTimezone));
      const up = snapshot.completionPct > snapshot.prevCompletionPct + 5;
      const down = snapshot.completionPct < snapshot.prevCompletionPct - 5;
      const deltaLabel = up ? 'Up from last week' : down ? 'Down from last week' : 'Even from last week';
      const insight = up
        ? 'Nice climb from last week — keep the momentum going.'
        : down
          ? "Dipped from last week — let's rebuild the trend."
          : 'Holding steady week over week — consistent is good.';
      return {
        status: 'shown',
        card: {
          type: 'progress_report',
          score: snapshot.performanceScore,
          delta_label: deltaLabel,
          trend: snapshot.performanceTrend,
          trend_labels: ['W', 'T', 'F', 'S', 'S', 'M', 'T'],
          insight,
        },
      };
    },

    show_readiness: async () => {
      const snapshot = await computeStatsSnapshot(supabase, userId, await resolveTimezone(supabase, userId, requestTimezone));
      const insight =
        snapshot.readinessScore >= 80
          ? "You're primed — a great day to push intensity."
          : snapshot.readinessScore >= 60
            ? 'Solid readiness — a normal session is a good call today.'
            : "Keep today's session moderate — sleep and nutrition can bring this back up fast.";
      return {
        status: 'shown',
        card: {
          type: 'readiness',
          score: snapshot.readinessScore,
          label: snapshot.readinessLabel,
          trend_label: snapshot.readinessTrendLabel,
          insight,
        },
      };
    },

    show_top_lifts: async () => {
      const snapshot = await computeStatsSnapshot(supabase, userId, await resolveTimezone(supabase, userId, requestTimezone));
      const insight =
        snapshot.topLifts.length > 0
          ? `${snapshot.topLifts[0].name} is leading the pack — keep chasing progressive overload.`
          : '';
      return {
        status: 'shown',
        card: {
          type: 'top_lifts',
          lifts: snapshot.topLifts,
          insight,
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

    add_set: async () => {
      await writeAppAction(supabase, userId, 'add_set', {});
      return { status: 'requested' };
    },

    end_workout: async (input) => {
      await writeAppAction(supabase, userId, 'end_workout', { status: input.completed ? 'completed' : 'partial' });
      return { status: 'requested' };
    },

    adjust_rest_timer: async (input) => {
      await writeAppAction(supabase, userId, 'adjust_rest_timer', {
        action: input.action,
        seconds: input.seconds ?? null,
      });
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
