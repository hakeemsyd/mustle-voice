// Real Supabase-backed tool handlers — the brain's actual read/write layer. Every plan-mutating
// handler re-checks docs/coaching-brain.md's safety invariant: nothing persists unless
// injury-validator says it's safe. Untestable without a live Supabase project (paused as of
// 2026-07-23); the orchestration loop itself is unit-tested with fakes in
// ../_shared/brain-orchestrator.test.ts.

import { humanizeFocus } from './humanize.ts';
import { convertLoadScheme, localizeWeights, normalizeExercisesDone } from './load-scheme.ts';
import { isBodyweightExercise, loadSchemeForExercise } from './exercise-catalog.ts';
import { issueConfirmToken, verifyConfirmToken } from './confirm-token.ts';
import { validatePlan, explainViolations, forbiddenTags, type Injury } from './injury-validator.ts';
import { validateSplit, explainSplitProblems } from './split-validator.ts';
import { APP_LINE_MODALITY } from './replay-history.ts';
import { resolveToolSetWeight } from './turn-set-outcome.ts';
import { matchSessionExercise } from './session-navigation.ts';
import { findInventedRepTargets } from './rep-target.ts';
import { computeNutritionTargets, computeBodyFatGoal, type GoalObjective } from './nutrition.ts';
import {
  resolveTodaySession,
  nowInTimezone,
  logsInTimezone,
  toTimezone,
  fetchRestDayDates,
  fetchDayOverrideSession,
} from './brain-context.ts';
import { buildLiveSessionSnapshot, LIVE_STATE_MAX_AGE_MS, type LiveSessionSnapshot } from './live-session-format.ts';
import { userClaimedSetFinished } from './set-completion.ts';
import { buildLoadHistory } from './load-history.ts';
import {
  CONSULTATION_TOPICS,
  missingConsultationTopics,
  type ConsultationTopic,
} from './consultation-context.ts';
import type { ToolHandlers } from './brain-orchestrator.ts';
import {
  defaultTrainingDays,
  describeTrainingDays,
  firstTrainingDayOnOrAfter,
  parseTrainingDays,
  resolveTrainingDays,
  weekdayLabel,
  weekdayOfKey,
} from './training-schedule.ts';

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

function topSetLabelFor(
  exercisesDone: { name: string; sets?: number; reps: string; load: string }[],
  units: 'metric' | 'imperial' = 'metric',
): string {
  let bestLoaded: { name: string; weight: number; reps: number } | null = null;
  let bestBodyweight: { name: string; reps: number } | null = null;
  for (const ex of exercisesDone) {
    if (ex.load === 'bodyweight') {
      const reps = parseCsvNumbers(ex.reps);
      if (reps.length === 0) continue;
      const maxReps = Math.max(...reps);
      if (!bestBodyweight || maxReps > bestBodyweight.reps) bestBodyweight = { name: ex.name, reps: maxReps };
      continue;
    }
    const loads = parseCsvNumbers(ex.load);
    const reps = parseCsvNumbers(ex.reps);
    const n = Math.min(loads.length, reps.length);
    for (let i = 0; i < n; i++) {
      if (!bestLoaded || loads[i] > bestLoaded.weight) bestLoaded = { name: ex.name, weight: loads[i], reps: reps[i] };
    }
  }
  if (bestLoaded) {
    const weight =
      units === 'imperial'
        ? `${Math.round(bestLoaded.weight * 2.20462 * 10) / 10} lb`
        : `${bestLoaded.weight} kg`;
    return `${bestLoaded.name} · ${weight} × ${bestLoaded.reps}`;
  }
  if (bestBodyweight) return `${bestBodyweight.name} · ${bestBodyweight.reps} reps`;
  return '';
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

  const now = timezone ? toTimezone(new Date(), timezone) : new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86_400_000);

  // now/startOfDay/weekAgo above are all in the "fake epoch" toTimezone() domain — every raw
  // row's `.at` (a genuine UTC timestamp) must go through the same conversion before being
  // compared against them, or every day-boundary check below silently reintroduces the
  // timezone's UTC offset as an error (confirmed root cause of the coach's protein/completion/
  // streak/volume numbers diverging from the client's for non-UTC users).
  const workouts = logsInTimezone((workoutRows ?? []) as WorkoutLogRow[], timezone);
  const foodRowsShifted = logsInTimezone((foodRows ?? []) as { at: string }[], timezone) as typeof foodRows;

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
    .map(([name, weights]) => ({ name, top_weight_kg: Math.max(...weights) }))
    .sort((a, b) => b.top_weight_kg - a.top_weight_kg)
    .slice(0, 3);

  const proteinByDay = new Map<string, number>();
  for (const r of foodRowsShifted ?? []) {
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

  const foodRowsToday = (foodRowsShifted ?? []).filter((r: any) => new Date(r.at) >= startOfDay);
  const caloriesToday = foodRowsToday.reduce((sum: number, r: any) => sum + (r.calories ?? 0), 0);
  const proteinToday = foodRowsToday.reduce((sum: number, r: any) => sum + (r.protein_g ?? 0), 0);
  const carbsToday = foodRowsToday.reduce((sum: number, r: any) => sum + (r.carbs_g ?? 0), 0);
  const fatToday = foodRowsToday.reduce((sum: number, r: any) => sum + (r.fat_g ?? 0), 0);

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
    // All four totals are exposed, not just protein, so read_state can quote the same numbers the
    // nutrition card shows rather than summing rows itself — see recent_food.totals_today.
    caloriesToday: Math.round(caloriesToday),
    proteinToday: Math.round(proteinToday),
    carbsToday: Math.round(carbsToday),
    fatToday: Math.round(fatToday),
    // Real per-macro sums from today's food_log rows — the same records the Fuel screen reads,
    // not an estimate. Confirmed live: the nutrition card previously derived "consumed" for every
    // macro (including protein, despite proteinToday already being computed correctly above but
    // never used here) as `target * caloriesConsumedRatio` — a fabricated number that could, and
    // did, disagree with the Fuel screen's real sums even when calories matched exactly.
    macroTargets: [
      { label: 'Protein', target: nutrition?.protein_g ?? 0, current: Math.round(proteinToday), unit: 'g' },
      { label: 'Carbs', target: nutrition?.carbs_g ?? 0, current: Math.round(carbsToday), unit: 'g' },
      { label: 'Fat', target: nutrition?.fat_g ?? 0, current: Math.round(fatToday), unit: 'g' },
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// start_todays_workout used to say "started" the instant the app_action row was queued — the
// client hadn't necessarily picked it up, run session.start(), and published live_session_state
// yet, so the reply could claim the workout was live before it actually was. Polls briefly for
// the client's own confirmation instead of trusting the queue write.
async function waitForLiveSessionStart(supabase: any, userId: string, after: string): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    await sleep(250);
    const { data } = await supabase
      .from('live_session_state')
      .select('updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (data && new Date(data.updated_at).getTime() >= new Date(after).getTime()) return true;
  }
  return false;
}

interface LiveSessionRead {
  state: any;
  snapshot: LiveSessionSnapshot | null;
  running: boolean;
}

async function readLiveSession(supabase: any, userId: string): Promise<LiveSessionRead> {
  const { data } = await supabase
    .from('live_session_state')
    .select('updated_at, state')
    .eq('user_id', userId)
    .maybeSingle();
  const fresh = !!data && Date.now() - new Date(data.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
  const snapshot = fresh && data.state ? buildLiveSessionSnapshot(data.state) : null;
  return {
    state: fresh ? data.state : null,
    snapshot,
    running: !!snapshot && snapshot.status !== 'finished',
  };
}

const totalLoggedSets = (state: any): number =>
  ((state?.loggedSets ?? []) as unknown[][]).reduce((n, sets) => n + (Array.isArray(sets) ? sets.length : 0), 0);

async function waitForLoggedSetTotal(supabase: any, userId: string, atLeast: number): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await sleep(250);
    const { data } = await supabase.from('live_session_state').select('state').eq('user_id', userId).maybeSingle();
    if (!data) return true;
    if (data.state?.ended || totalLoggedSets(data.state) >= atLeast) return true;
  }
  return false;
}

async function waitForLoggedSetTotalBelow(supabase: any, userId: string, before: number): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await sleep(250);
    const { data } = await supabase.from('live_session_state').select('state').eq('user_id', userId).maybeSingle();
    if (data && totalLoggedSets(data.state) < before) return true;
  }
  return false;
}

async function waitForExerciseAt(supabase: any, userId: string, name: string): Promise<boolean> {
  const wanted = name.trim().toLowerCase();
  for (let i = 0; i < 8; i++) {
    await sleep(250);
    const { data } = await supabase.from('live_session_state').select('state').eq('user_id', userId).maybeSingle();
    const current = data?.state?.exercises?.[data?.state?.currentExerciseIndex ?? -1];
    const names = ((data?.state?.exercises ?? []) as { name?: string }[]).map((e) => String(e?.name ?? '').toLowerCase());
    if (String(current?.name ?? '').toLowerCase() === wanted || names.includes(wanted)) return true;
  }
  return false;
}

async function waitForExerciseIndex(supabase: any, userId: string, index: number): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    await sleep(250);
    const { data } = await supabase
      .from('live_session_state')
      .select('state')
      .eq('user_id', userId)
      .maybeSingle();
    if (data?.state?.currentExerciseIndex === index) return true;
  }
  return false;
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

async function writePlan(
  supabase: any,
  userId: string,
  plan: any,
  options: { confirmSecret?: string; requireConfirm?: boolean } = {},
) {
  const names = plan.sessions.flatMap((s: any) => s.exercises.map((e: any) => e.name));
  const [injuries, exerciseByName, { data: recentLogs }] = await Promise.all([
    fetchActiveInjuries(supabase, userId),
    resolveExercises(supabase, names),
    supabase
      .from('workout_log')
      .select('at, exercises_done')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      .limit(10),
  ]);
  const exercisesWithLoadHistory = new Set(
    buildLoadHistory(recentLogs ?? []).map((h) => h.name.toLowerCase()),
  );

  const exercisesForValidator = names.map((name: string) => ({
    name,
    contraindicatedFor: exerciseByName.get(name)?.contraindicated_for ?? [],
  }));
  const violations = validatePlan(exercisesForValidator, injuries);
  if (violations.length > 0) throw new Error(explainViolations(violations));

  // The shape of the week, not the safety of its exercises. Every exercise in a split can be
  // individually fine while the split itself is wrong by construction — confirmed live: a
  // generated plan ran Upper Push on two consecutive days and gave push double the volume of
  // pull, and passed every gate because nothing looked at the week as a whole.
  const splitProblems = validateSplit(
    plan.sessions.map((s: any) => ({ day_order: s.day_order, focus: humanizeFocus(s.focus), weekday: s.weekday })),
  );
  if (splitProblems.length > 0) {
    throw new Error(
      `That split doesn't work as scheduled. ${explainSplitProblems(splitProblems)} ` +
        'Nothing was saved — reorder or re-focus the days and call the tool again.',
    );
  }

  for (const name of names) {
    if (!exerciseByName.has(name)) {
      throw new Error(
        `Unknown exercise "${name}" — not in the catalog. Nothing was saved. Do not pick a ` +
          `replacement yourself: tell the user this exact exercise isn't available, propose the ` +
          `closest catalog alternative, wait for them to agree to it (or name their own), and only ` +
          `then call this tool again with that confirmed name.`,
      );
    }
  }

  const trainingDays = plan.training_days == null ? null : parseTrainingDays(plan.training_days);
  if (plan.training_days != null && !trainingDays) {
    throw new Error(
      'training_days must be a list of weekday names (e.g. ["monday", "wednesday", "friday"]). Nothing was saved.',
    );
  }
  const daysPerWeek = trainingDays ? trainingDays.length : plan.days_per_week;
  const previewDays = trainingDays ?? defaultTrainingDays(daysPerWeek);

  // Only generate_training_plan gates on this, not update_training_plan (a live plan revision
  // is already an in-conversation, immediate action per the client's confirmation-gate spec) —
  // a brand-new user's very first plan is the one place Damion asked for an explicit consultation
  // and start-date confirmation before anything goes live.
  if (options.requireConfirm) {
    const { data: anyPriorPlan } = await supabase
      .from('training_plan')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (!anyPriorPlan) {
      const { data: progress } = await supabase
        .from('consultation_progress')
        .select('topics')
        .eq('user_id', userId)
        .maybeSingle();
      const missing = missingConsultationTopics((progress?.topics ?? []) as string[]);
      if (missing.length > 0) {
        throw new Error(
          `Not ready to propose a plan yet — still missing from the consultation: ${missing.join(', ')} ` +
            `(of ${CONSULTATION_TOPICS.join(', ')}). Nothing was saved. Keep the conversation natural: ask ` +
            'about what is missing, call note_consultation_covered as each is resolved (a clear "I don\'t ' +
            'know, use your judgment" counts as resolved too), then call generate_training_plan again once ' +
            'all four are covered.',
        );
      }
    }

    // Keyed on a fixed literal, not the plan payload itself — a full multi-session/exercise plan
    // is exactly the kind of large structure an LLM won't reproduce byte-for-byte between preview
    // and confirm calls (see log_workout's identical fix, same session), and there's only ever one
    // "confirm my new plan" action pending at a time for a given conversation, so a payload-bound
    // signature buys nothing here.
    const tokenKey = 'new_plan';
    if (
      !plan.confirm ||
      !(await verifyConfirmToken(options.confirmSecret!, 'generate_training_plan', tokenKey, plan.confirm_token))
    ) {
      return {
        status: 'preview',
        split: plan.split,
        days_per_week: daysPerWeek,
        training_days: previewDays.map(weekdayLabel),
        sessions: plan.sessions,
        confirm_token: await issueConfirmToken(options.confirmSecret!, 'generate_training_plan', tokenKey),
        instruction:
          'Nothing is saved yet. Read back the plan (split, which weekdays they train and rest, one line ' +
          'per session in rotation order) and the proposed nutrition approach, confirm which real day ' +
          'they want to start on, wait for explicit agreement, then call generate_training_plan again ' +
          'with the same fields plus confirm:true, starts_on (that exact date, YYYY-MM-DD), and this ' +
          'exact confirm_token. The first session lands on the start day and the rest follow in order ' +
          'on the training days; never promise a fixed weekday for a session.',
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(plan.starts_on ?? ''))) {
      throw new Error(
        'starts_on (YYYY-MM-DD) is required alongside confirm:true and must be a real calendar date — ' +
          'nothing was saved. Compute it from the current date in your context plus what the user just ' +
          'agreed to, then call generate_training_plan again with the same fields, confirm:true, this ' +
          'exact confirm_token, and starts_on.',
      );
    }
    const startWeekday = weekdayOfKey(plan.starts_on);
    if (previewDays.length > 0 && !previewDays.includes(startWeekday)) {
      const firstDay = firstTrainingDayOnOrAfter(plan.starts_on, previewDays);
      throw new Error(
        `starts_on ${plan.starts_on} is a ${weekdayLabel(startWeekday)}, which is a rest day in this plan ` +
          `(${describeTrainingDays(previewDays)}). Nothing was saved. Ask whether they want to start on ` +
          `${weekdayLabel(weekdayOfKey(firstDay))} ${firstDay} instead, or to add ${weekdayLabel(startWeekday)} ` +
          'to training_days, then call again.',
      );
    }
  }

  const rpcPlan = {
    split: plan.split,
    days_per_week: daysPerWeek,
    training_days: trainingDays,
    starts_on: plan.starts_on ?? null,
    sessions: plan.sessions.map((session: any) => ({
      day_order: session.day_order,
      weekday: null,
      focus: humanizeFocus(session.focus),
      exercises: session.exercises.map((e: any) => ({
        exercise_id: exerciseByName.get(e.name)!.id,
        sets: e.sets,
        rep_scheme: e.rep_scheme,
        load_scheme: loadSchemeForExercise(e.name, e.load_scheme, exercisesWithLoadHistory.has(e.name.toLowerCase())),
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

  if (options.requireConfirm) {
    await supabase.from('consultation_progress').delete().eq('user_id', userId);
  }

  // Home caches what it fetched on its last load, so a plan created from chat left it showing
  // "No plan yet" until the app was killed and relaunched. refresh_home already exists for
  // exactly this (AppActionBridge), it was just never fired for the events that change the plan.
  await writeAppAction(supabase, userId, 'refresh_home', { reason: 'plan_written' }).catch(() => {});

  return {
    status: 'persisted',
    plan_id: planId,
    split: plan.split,
    days_per_week: daysPerWeek,
    training_days: trainingDays || options.requireConfirm ? previewDays.map(weekdayLabel) : 'unchanged',
  };
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
  // Home's macro ring reads these, so it needs the same nudge the plan write gets.
  await writeAppAction(supabase, userId, 'refresh_home', { reason: 'nutrition_targets_set' }).catch(() => {});

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
  const { data } = await supabase.from('profile').select('timezone').eq('user_id', userId).maybeSingle();
  const timezone = requestTimezone || data?.timezone || null;
  // Mirrors buildContextBlock's self-healing — profile.timezone is only ever written once at
  // onboarding, so keep it fresh whenever a live client timezone accompanies the request instead
  // of letting it silently drift after travel/DST.
  if (requestTimezone && requestTimezone !== data?.timezone) {
    const { error } = await supabase.from('profile').update({ timezone: requestTimezone }).eq('user_id', userId);
    if (error) console.error('[brain] failed to refresh profile.timezone:', error.message);
  }
  return timezone;
}


interface TodaysExercise {
  exercise_id: string;
  name: string;
  sets: number;
  rep_scheme: string;
  load_scheme: string | null;
}

const resolveTodaysExercises = async (
  supabase: any,
  userId: string,
  timezone: string | null,
): Promise<{ focus: string; exercises: TodaysExercise[] } | null> => {
  const now = nowInTimezone(timezone);
  const todayKey = now.toISOString().slice(0, 10);
  const [{ data: plan }, { data: recentLogs }, restDayDates, override] = await Promise.all([
    supabase
      .from('training_plan')
      .select('starts_on, days_per_week, training_days, plan_session(id, day_order, weekday, focus)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('workout_log')
      .select('at, plan_session_id, status')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      .limit(10),
    fetchRestDayDates(supabase, userId, new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)),
    fetchDayOverrideSession(supabase, userId, todayKey),
  ]);

  const today = resolveTodaySession(
    plan?.plan_session ?? [],
    logsInTimezone(recentLogs ?? [], timezone),
    now,
    restDayDates,
    override,
    plan?.starts_on ?? null,
    resolveTrainingDays(plan, plan?.plan_session ?? []),
  );
  if (!today) return null;

  const { data: full } = await supabase
    .from('plan_session')
    .select('focus, plan_exercise(ord, sets, rep_scheme, load_scheme, exercise_id, exercise(name))')
    .eq('id', today.id)
    .maybeSingle();
  if (!full) return null;

  const exercises: TodaysExercise[] = (full.plan_exercise ?? [])
    .slice()
    .sort((a: any, b: any) => a.ord - b.ord)
    .map((e: any) => ({
      exercise_id: e.exercise_id,
      name: e.exercise?.name ?? '',
      sets: e.sets,
      rep_scheme: e.rep_scheme,
      load_scheme: e.load_scheme ?? null,
    }))
    .filter((e: TodaysExercise) => !!e.name);

  return exercises.length > 0 ? { focus: humanizeFocus(full.focus), exercises } : null;
};

export function createHandlers(
  supabase: any,
  userId: string,
  requestTimezone?: string | null,
  options: { currentUserText?: string | null; appLoggedThisTurn?: boolean } = {},
): ToolHandlers {
  // Secret for confirm-token signing (see confirm-token.ts) — reused rather than a new env
  // var since it's already injected into every edge function and never leaves this process.
  const confirmSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  let unitsPromise: Promise<'metric' | 'imperial'> | null = null;
  const resolveUnits = (): Promise<'metric' | 'imperial'> => {
    unitsPromise ??= supabase
      .from('profile')
      .select('unit_prefs')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }: any) => (data?.unit_prefs === 'imperial' ? 'imperial' : 'metric'));
    return unitsPromise!;
  };

  const handlers: ToolHandlers = {
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
          const [timezone, { data: recentLogs }, units] = await Promise.all([
            resolveTimezone(supabase, userId, requestTimezone),
            supabase
              .from('workout_log')
              .select('at, plan_session_id, status')
              .eq('user_id', userId)
              .order('at', { ascending: false })
              .limit(10),
            resolveUnits(),
          ]);
          const nextSession = resolveTodaySession(
            sessions,
            logsInTimezone(recentLogs ?? [], timezone),
            nowInTimezone(timezone),
            undefined,
            undefined,
            out.plan?.starts_on ?? null,
            resolveTrainingDays(out.plan, sessions),
          );
          out.next_session_to_train = nextSession
            ? {
                plan_session_id: nextSession.id,
                focus: humanizeFocus(nextSession.focus),
                exercises: (nextSession.plan_exercise ?? [])
                  .slice()
                  .sort((a: any, b: any) => a.ord - b.ord)
                  .map((e: any) => ({
                    name: e.exercise?.name,
                    sets: e.sets,
                    rep_scheme: e.rep_scheme,
                    load_scheme: e.load_scheme ? convertLoadScheme(e.load_scheme, units) : e.load_scheme,
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
              s.id === nextSession?.id
                ? {
                    ...s,
                    plan_exercise: (s.plan_exercise ?? []).map((e: any) => ({
                      ...e,
                      load_scheme: e.load_scheme ? convertLoadScheme(e.load_scheme, units) : e.load_scheme,
                    })),
                  }
                : { id: s.id, day_order: s.day_order, weekday: s.weekday, focus: s.focus },
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
            .neq('modality', APP_LINE_MODALITY)
            .order('at', { ascending: false })
            .limit(10)
        ).data;
      }
      if (scope.includes('recent_logs')) {
        const [timezone, { data: foodRows }, snapshot] = await Promise.all([
          resolveTimezone(supabase, userId, requestTimezone),
          supabase.from('food_log').select('*').eq('user_id', userId).order('at', { ascending: false }).limit(15),
          computeStatsSnapshot(supabase, userId, requestTimezone ?? null),
        ]);

        // Raw ISO timestamps forced the model to do its own UTC-to-local mental math to decide
        // what counts as "today" — confirmed live: it pulled a two-day-old meal into today's
        // total. Doing that conversion here and labeling each row explicitly removes the guess.
        const todayLocal = nowInTimezone(timezone).toISOString().slice(0, 10);
        // The totals come from computeStatsSnapshot — the SAME function behind
        // show_nutrition_summary, Home and Fuel — instead of being summed by the model from the
        // rows below. Asking it to add them up made read_state a second, competing implementation
        // of "today's intake", and the two disagreed in front of the user: the coach said 105g of
        // protein and the nutrition card said 153g seconds later, the difference being a previous
        // day's steak and pitas that the model's own arithmetic had swept in. The rows are still
        // listed (they are what lets it name and edit an individual meal) but they are no longer
        // the basis of any total.
        out.recent_food = {
          today_date: todayLocal,
          totals_today: {
            calories: snapshot.caloriesToday,
            protein_g: snapshot.proteinToday,
            carbs_g: snapshot.carbsToday,
            fat_g: snapshot.fatToday,
          },
          instruction:
            'totals_today is the authoritative intake for today, computed by the app from the same ' +
            'date-filtered records Home, Fuel and show_nutrition_summary use. Quote those numbers ' +
            'verbatim and NEVER add up the entries below to produce a total of your own — doing so ' +
            'is what produced a coach total and an on-screen total that disagreed by a whole ' +
            'previous day of food. The entries are provided only so you can refer to, correct or ' +
            'delete an individual meal; rows with is_today=false are NOT part of today at all.',
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

    generate_training_plan: (input) => writePlan(supabase, userId, input, { confirmSecret, requireConfirm: true }),
    update_training_plan: (input) => writePlan(supabase, userId, input),

    generate_nutrition_targets: (input) => writeNutritionTargets(supabase, userId, input.goal),
    update_nutrition_targets: (input) => writeNutritionTargets(supabase, userId, input.goal),

    estimate_body_fat_goal: async (input) => {
      const { data: weightRow, error: weightError } = await supabase
        .from('weight_log')
        .select('weight_kg')
        .eq('user_id', userId)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (weightError) throw new Error(`weight_log fetch: ${weightError.message}`);
      if (!weightRow) return { status: 'no_weight', reason: 'No weight on file yet — ask for it first.' };

      const result = computeBodyFatGoal(weightRow.weight_kg, input.current_body_fat_pct, input.target_body_fat_pct);

      const { error: insertError } = await supabase
        .from('weight_log')
        .insert({ user_id: userId, weight_kg: weightRow.weight_kg, body_fat_pct: input.current_body_fat_pct });
      if (insertError) console.error('[brain] failed to log body_fat_pct:', insertError.message);

      return { status: 'computed', ...result };
    },

    record_injury: async (input) => {
      const { error } = await supabase.from('injury').insert({
        user_id: userId,
        area: input.area,
        severity: input.severity ?? null,
        pain_level: typeof input.pain_level === 'number' ? input.pain_level : null,
        note: input.note ?? null,
      });
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
      // Confirmed live: despite the tool schema marking these required, a call landed with all
      // four omitted and silently saved a real meal at zero calories/protein/carbs/fat — which
      // both the Fuel screen and Home's macro totals then read as genuinely zero nutrition, no
      // error anywhere. Reject before ever touching the DB rather than trust schema enforcement
      // alone.
      const missingMacro = (['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).find(
        (key) => input[key] === undefined || input[key] === null,
      );
      if (missingMacro) {
        return {
          status: 'missing_macro_estimate',
          instruction:
            `Nothing was saved — ${missingMacro} was left out. Estimate a realistic value yourself ` +
            'from the description (assume a typical serving size if the user gave no quantities) and ' +
            'call log_food again with all four of calories/protein_g/carbs_g/fat_g filled in.',
        };
      }

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

      // Confirmed live (Damion): a second, genuinely separate serving of a similar-sounding meal
      // ("another shake, no banana this time") tripped this heuristic with no way past it — the
      // model kept calling log_food, kept getting flagged, and the second shake's macros ended up
      // added to the day's running total in conversation while no row backing them ever existed,
      // so the Fuel screen and the coach's own totals silently disagreed. confirmed_new_meal is
      // the explicit override: only ever set after the model has actually asked and been told
      // this is a new meal, not a correction (see this tool's own schema description).
      const nearDuplicate = input.confirmed_new_meal
        ? null
        : (recent ?? []).find((row: any) => looksLikeSameMeal(row.description, input.description));
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
            `logged a little earlier, not a new meal. Ask the user which it is. If it's a correction, ` +
            `call update_food with id "${nearDuplicate.id}" instead. If they confirm it's genuinely a ` +
            'separate meal, call log_food again with the same description and confirmed_new_meal: true.',
        };
      }

      const tokenKey = JSON.stringify({
        d: String(input.description ?? '').trim().toLowerCase(),
        c: input.calories,
        p: input.protein_g,
        cb: input.carbs_g,
        f: input.fat_g,
      });
      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'log_food', tokenKey, input.confirm_token))) {
        return {
          status: 'preview',
          description: input.description,
          calories: input.calories,
          protein_g: input.protein_g,
          carbs_g: input.carbs_g,
          fat_g: input.fat_g,
          confirm_token: await issueConfirmToken(confirmSecret, 'log_food', tokenKey),
          instruction:
            'NOTHING HAS BEEN SAVED. Read the estimate back to the user in one short line (the food, ' +
            'the calories and the macros), say plainly that it is your estimate, and wait for them to ' +
            'agree in their NEXT message. Only then call log_food again with the same fields plus ' +
            'confirm:true and this exact confirm_token. Never say "logged" until that second call ' +
            'returns status "logged".',
        };
      }

      // confirmed_new_meal is a tool-input signal only — food_log has no such column, and
      // spreading it into the insert would fail the write outright.
      const { confirmed_new_meal: _confirmedNewMeal, confirm: _confirm, confirm_token: _confirmToken, ...foodRow } = input;
      const { data, error } = await supabase
        .from('food_log')
        .insert({ user_id: userId, ...foodRow })
        .select('id')
        .single();
      if (error) throw new Error(`food_log insert: ${error.message}`);
      return { status: 'logged', id: data.id };
    },

    update_food: async (input) => {
      const { id, confirm, confirm_token, ...fields } = input;
      if (!id) throw new Error('update_food requires the id from read_state\'s recent_food.');

      const { data: current, error: fetchError } = await supabase
        .from('food_log')
        .select('id, description, calories, protein_g, carbs_g, fat_g')
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();
      if (fetchError) throw new Error(`food_log fetch: ${fetchError.message}`);
      if (!current) return { status: 'not_found' };
      const proposed = { ...current, ...fields };
      // Keyed on the row id alone, not the full proposed payload — same reliability problem as
      // log_workout below: a model resending its own proposed fields verbatim on the confirm call
      // isn't guaranteed to reproduce them byte-for-byte (rounding, field order), which silently
      // failed verification and forced another preview instead of saving.
      const tokenKey = id;

      // Structural confirm gate: without a valid token this only previews and never writes, so
      // the model cannot say "done" before the user has actually agreed to THESE exact values in
      // THIS exchange — confirmed live that a bare confirm:true boolean wasn't enough, it called
      // the tool with confirm:true straight off a misheard turn and said done in one shot.
      if (!confirm || !(await verifyConfirmToken(confirmSecret, 'update_food', tokenKey, confirm_token))) {
        return {
          status: 'preview',
          id,
          current,
          proposed,
          confirm_token: await issueConfirmToken(confirmSecret, 'update_food', tokenKey),
          instruction:
            'Nothing is saved yet. Read back exactly what will change and wait for the user to explicitly ' +
            'agree in their next message, then call update_food again with the same fields plus ' +
            'confirm:true and this exact confirm_token.',
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

      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'delete_food', input.id, input.confirm_token))) {
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
          confirm_token: await issueConfirmToken(confirmSecret, 'delete_food', input.id),
          instruction:
            'Nothing is deleted yet. Confirm with the user exactly which meal you are about to remove and ' +
            'wait for explicit agreement, then call delete_food again with confirm:true and this exact ' +
            'confirm_token.',
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
      // Keyed on the session only, not the full exercises_done payload — a full multi-exercise/
      // sets/reps/weights report relayed piece by piece over voice is exactly the payload an LLM
      // is least likely to reproduce byte-for-byte between the preview and confirm calls (field
      // order, a "10" vs "10.0", one extra note), so a payload-bound signature silently rejected
      // the confirm and looped back to another preview — confirmed live: the user kept saying
      // "yes" and kept getting asked again. The token's real job is proving a preview genuinely
      // happened moments ago for this same session, not that the payload never changed a bit.
      const tokenKey = input.plan_session_id ?? 'manual';
      // Longer-lived than the default: relaying a whole workout's exercises/sets/reps/weights by
      // voice, then confirming, routinely runs past the standard 5-minute window on its own.
      const LOG_WORKOUT_TOKEN_TTL_MS = 15 * 60 * 1000;
      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'log_workout', tokenKey, input.confirm_token))) {
        return {
          status: 'preview',
          exercises_done: normalizeExercisesDone(input.exercises_done),
          confirm_token: await issueConfirmToken(confirmSecret, 'log_workout', tokenKey, LOG_WORKOUT_TOKEN_TTL_MS),
          instruction:
            'Nothing is saved yet. Read back exactly what will be logged and wait for the user to ' +
            'explicitly agree in their next message, then call log_workout again with the same ' +
            'fields plus confirm:true and this exact confirm_token.',
        };
      }
      // A whole workout described conversationally, start to finish, was never tracked live —
      // every set here was told to the coach, not captured by logSet during a running session.
      const exercisesDone = (normalizeExercisesDone(input.exercises_done ?? []) as any[]).map((e: any) => ({
        ...e,
        tracked: 'reported',
      }));
      const { error } = await supabase.from('workout_log').insert({
        user_id: userId,
        plan_session_id: input.plan_session_id ?? null,
        exercises_done: exercisesDone,
        source: 'independent',
        note: input.note ?? null,
      });
      if (error) throw new Error(`workout_log insert: ${error.message}`);
      return { status: 'logged' };
    },

    resolve_interrupted_workout: async (input) => {
      const { data: row, error: fetchError } = await supabase
        .from('workout_log')
        .select('id, exercises_done')
        .eq('id', input.workout_log_id)
        .eq('user_id', userId)
        .eq('status', 'interrupted')
        .maybeSingle();
      if (fetchError) throw new Error(`workout_log fetch: ${fetchError.message}`);
      if (!row) return { status: 'not_found' };

      const tokenKey = input.workout_log_id;
      if (
        !input.confirm ||
        !(await verifyConfirmToken(confirmSecret, 'resolve_interrupted_workout', tokenKey, input.confirm_token))
      ) {
        return {
          status: 'preview',
          workout_log_id: row.id,
          already_logged: row.exercises_done,
          confirm_token: await issueConfirmToken(confirmSecret, 'resolve_interrupted_workout', tokenKey),
          instruction:
            'Nothing has changed yet. State plainly what will happen for the chosen outcome ' +
            '(completed_independent/ended_early/discard) and wait for explicit agreement, then call ' +
            'again with the same fields plus confirm:true and this exact confirm_token.',
        };
      }

      if (input.outcome === 'discard') {
        const { error: delError } = await supabase.from('workout_log').delete().eq('id', row.id).eq('user_id', userId);
        if (delError) throw new Error(`workout_log delete: ${delError.message}`);
        return { status: 'discarded' };
      }

      if (input.outcome === 'ended_early') {
        const { error: updError } = await supabase
          .from('workout_log')
          .update({ status: 'partial' })
          .eq('id', row.id)
          .eq('user_id', userId);
        if (updError) throw new Error(`workout_log update: ${updError.message}`);
        return { status: 'partial' };
      }

      // completed_independent — whatever was tracked live before the interruption stays exactly
      // as it was; anything the user reports happened afterward is appended and marked reported,
      // never merged into or replacing the live entries.
      const additional = (normalizeExercisesDone(input.additional_exercises_done ?? []) as any[]).map((e: any) => ({
        ...e,
        tracked: 'reported',
      }));
      const merged = [...(row.exercises_done ?? []), ...additional];
      const { error: updError } = await supabase
        .from('workout_log')
        .update({ status: 'completed', source: 'independent', exercises_done: merged })
        .eq('id', row.id)
        .eq('user_id', userId);
      if (updError) throw new Error(`workout_log update: ${updError.message}`);
      return { status: 'completed' };
    },

    log_checkin: async (input) => {
      const { body_fat_pct: bodyFatPct, ...checkinFields } = input;
      const { error } = await supabase.from('checkin_log').insert({ user_id: userId, ...checkinFields });
      if (error) throw new Error(`checkin_log insert: ${error.message}`);

      if (typeof input.weight_kg === 'number') {
        const { error: weightError } = await supabase
          .from('weight_log')
          .insert({ user_id: userId, weight_kg: input.weight_kg, body_fat_pct: bodyFatPct ?? null });
        if (weightError) console.error('[brain] weight_log insert:', weightError.message);
      } else if (typeof bodyFatPct === 'number') {
        const { data: lastWeight, error: fetchError } = await supabase
          .from('weight_log')
          .select('weight_kg')
          .eq('user_id', userId)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fetchError) console.error('[brain] weight_log fetch for body-fat:', fetchError.message);
        else if (lastWeight) {
          const { error: weightError } = await supabase
            .from('weight_log')
            .insert({ user_id: userId, weight_kg: lastWeight.weight_kg, body_fat_pct: bodyFatPct });
          if (weightError) console.error('[brain] weight_log insert (body-fat only):', weightError.message);
        }
      }

      return { status: 'logged' };
    },

    open_screen: async (input) => {
      // ActiveSession renders whatever ActiveSessionContext currently holds, which is empty once
      // a workout has ended — sending the user there with nothing running would open a broken
      // screen instead of the workout they asked to resume. Confirmed live: "resume the active
      // session" had no navigation path at all before this screen was addable here, so the coach
      // could only recite the exercise/reps from the live session state block, never reopen it.
      if (input.screen === 'ActiveSession') {
        const { data: liveRow } = await supabase
          .from('live_session_state')
          .select('updated_at')
          .eq('user_id', userId)
          .maybeSingle();
        const isLive = liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
        if (!isLive) return { status: 'no_session' };
      }
      await writeAppAction(supabase, userId, 'navigate', { screen: input.screen });
      return { status: 'opened', screen: input.screen };
    },

    open_todays_workout: async () => {
      const { data: activePlan } = await supabase
        .from('training_plan')
        .select('starts_on, days_per_week, training_days, plan_session(id, day_order, weekday, focus)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      const sessions = activePlan?.plan_session ?? [];

      const [timezone, { data: recentLogs }, restDayDates] = await Promise.all([
        resolveTimezone(supabase, userId, requestTimezone),
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
        fetchRestDayDates(supabase, userId, new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)),
      ]);

      // Resolved before the no-plan bail-out: a custom session built for today is due on its own
      // authority, with or without an active plan behind it.
      const now = nowInTimezone(timezone);
      const override = await fetchDayOverrideSession(supabase, userId, now.toISOString().slice(0, 10));
      if (sessions.length === 0 && !override) return { status: 'no_session', reason: 'no_active_plan' };

      const today = resolveTodaySession(
        sessions,
        logsInTimezone(recentLogs ?? [], timezone),
        now,
        restDayDates,
        override,
        activePlan?.starts_on ?? null,
        resolveTrainingDays(activePlan, sessions),
      );
      if (!today) return { status: 'no_session', reason: 'rest_day' };

      await writeAppAction(supabase, userId, 'navigate', {
        screen: 'PreWorkoutPreview',
        params: { planSessionId: today.id },
      });
      return { status: 'opened', plan_session_id: today.id, focus: humanizeFocus(today.focus) };
    },

    start_todays_workout: async (input) => {
      const { data: activePlan } = await supabase
        .from('training_plan')
        .select('starts_on, days_per_week, training_days, plan_session(id, day_order, weekday, focus)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      const sessions = activePlan?.plan_session ?? [];

      const [timezone, { data: recentLogs }, restDayDates, { data: liveRow }] = await Promise.all([
        resolveTimezone(supabase, userId, requestTimezone),
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
        fetchRestDayDates(supabase, userId, new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)),
        supabase.from('live_session_state').select('updated_at, state').eq('user_id', userId).maybeSingle(),
      ]);

      const openSnapshot =
        liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS && liveRow.state
          ? buildLiveSessionSnapshot(liveRow.state)
          : null;
      if (openSnapshot && openSnapshot.status !== 'finished') {
        const openFocus = openSnapshot.focus ? humanizeFocus(openSnapshot.focus) : 'a workout';
        const openSets = totalLoggedSets(liveRow.state);
        return {
          status: 'already_active',
          open_workout_focus: openFocus,
          open_workout_current_exercise: openSnapshot.currentExercise?.name ?? null,
          open_workout_sets_logged: openSets,
          instruction:
            `Nothing was started. A workout is still open in the app from earlier: ${openFocus}, ` +
            `${openSets} set${openSets === 1 ? '' : 's'} logged. It may not be the session they just asked ` +
            'for. Tell them plainly that this earlier workout is still open and ask whether to end it ' +
            'first (end_workout). Never tell them they are already in the workout they asked for and ' +
            'never tell them to tap Start.',
        };
      }

      // A custom session built for today is startable on its own authority, with or without an
      // active plan behind it — so the no-plan bail-out happens after this, not before.
      const now = nowInTimezone(timezone);
      const override = await fetchDayOverrideSession(supabase, userId, now.toISOString().slice(0, 10));
      if (sessions.length === 0 && !override) return { status: 'no_session', reason: 'no_active_plan' };

      const logs = logsInTimezone((recentLogs ?? []) as any[], timezone);
      const todayKey = now.toISOString().slice(0, 10);
      const scheduled = resolveTodaySession(
        sessions,
        logs,
        now,
        restDayDates,
        override,
        activePlan?.starts_on ?? null,
        resolveTrainingDays(activePlan, sessions),
      );
      const nextInRotation = scheduled
        ? null
        : resolveTodaySession(sessions, logs, now, new Set(), null, activePlan?.starts_on ?? null);
      if (!scheduled && !(input.train_on_rest_day && nextInRotation)) {
        const notStarted = !!activePlan?.starts_on && todayKey < activePlan.starts_on;
        return {
          status: 'no_session',
          reason: notStarted ? 'plan_not_started' : 'rest_day',
          next_session: nextInRotation ? humanizeFocus(nextInRotation.focus) : null,
          instruction: notStarted
            ? `Nothing was started. The plan begins ${activePlan.starts_on}. If they want to start now, use update_plan_start_date.`
            : nextInRotation
              ? `Nothing was started. Today is a rest day. If they clearly want to train anyway, call ` +
                `start_todays_workout again with train_on_rest_day:true to do their next session ` +
                `(${humanizeFocus(nextInRotation.focus)}) today; the order continues from it afterwards.`
              : 'Nothing was started. Nothing is due today (already trained today or a rest day).',
        };
      }
      const trainingOnRestDay = !scheduled;
      const today = scheduled ?? nextInRotation!;

      // Deliberately NOT a hard confirm_token requirement, unlike update_food/delete_food/
      // reschedule_today/end_workout below — Damion's explicit call: a clear, unambiguous "start
      // my workout" is itself sufficient confirmation and must fire in one turn, no round trip.
      // confirm:true alone is honored; a token is only checked when the model chooses to send
      // one (i.e. it previewed first because IT judged the request ambiguous) — see the prompt
      // instruction, which is where the actual clear/ambiguous judgment call now lives.
      if (!input.confirm) {
        return {
          status: 'preview',
          plan_session_id: today.id,
          focus: humanizeFocus(today.focus),
          confirm_token: await issueConfirmToken(confirmSecret, 'start_todays_workout', today.id),
          instruction: trainingOnRestDay
            ? 'Nothing has started yet. Today is a rest day; confirm they want to do their next session ' +
              `(${humanizeFocus(today.focus)}) today instead, then call start_todays_workout again with ` +
              'confirm:true and train_on_rest_day:true.'
            : 'Nothing has started yet. Confirm this is the session they mean and that they want to ' +
              'begin right now, then call start_todays_workout again with confirm:true.',
        };
      }
      if (
        input.confirm_token !== undefined &&
        !(await verifyConfirmToken(confirmSecret, 'start_todays_workout', today.id, input.confirm_token))
      ) {
        // A token was actually supplied but doesn't match — the safer read is that state moved
        // on since that preview (a different session now due, or it's stale), not that the user
        // changed their mind, so re-preview rather than silently starting the wrong thing.
        return {
          status: 'preview',
          plan_session_id: today.id,
          focus: humanizeFocus(today.focus),
          confirm_token: await issueConfirmToken(confirmSecret, 'start_todays_workout', today.id),
          instruction: 'That confirmation no longer matches — confirm again before starting.',
        };
      }

      if (trainingOnRestDay) {
        const { error: overrideError } = await supabase
          .from('day_override')
          .upsert(
            { user_id: userId, date: todayKey, plan_session_id: today.id, reason: 'train_on_rest_day' },
            { onConflict: 'user_id,date' },
          );
        if (overrideError) throw new Error(`day_override upsert: ${overrideError.message}`);
        await writeAppAction(supabase, userId, 'refresh_home', { reason: 'train_on_rest_day' }).catch(() => {});
      }

      const requestedAt = new Date().toISOString();
      await writeAppAction(supabase, userId, 'start_workout', { plan_session_id: today.id });
      const landed = await waitForLiveSessionStart(supabase, userId, requestedAt);
      if (!landed) {
        return {
          status: 'starting',
          plan_session_id: today.id,
          focus: humanizeFocus(today.focus),
          instruction:
            "The app hasn't confirmed the session is open yet. Tell them you're launching it — " +
            'do not say they are live, do not give a set instruction, and do not ask for reps. ' +
            'Wait for a live session state block in a later turn before treating it as active.',
        };
      }
      return { status: 'started', plan_session_id: today.id, focus: humanizeFocus(today.focus) };
    },

    undo_last_set: async () => {
      const live = await readLiveSession(supabase, userId);
      if (!live.running) {
        return {
          status: 'no_session',
          instruction: 'Nothing was removed. There is no workout running in the app right now.',
        };
      }
      const before = totalLoggedSets(live.state);
      if (before === 0) {
        return {
          status: 'no_set_to_undo',
          instruction: 'Nothing was removed: no set is logged in this workout yet. Say so plainly.',
        };
      }
      await writeAppAction(supabase, userId, 'undo_last_set', {});
      if (!(await waitForLoggedSetTotalBelow(supabase, userId, before))) {
        return {
          status: 'not_confirmed',
          instruction:
            'The undo was sent but the app has NOT confirmed it. Do not say the set was removed. Ask ' +
            'them to check the card; the live session state block is the truth.',
        };
      }
      return {
        status: 'undone',
        sets_logged_now: before - 1,
        instruction:
          'The most recent logged set is removed from the card and from the saved workout. Confirm ' +
          'that in one short line and ask for the correct reps (and weight if it was wrong).',
      };
    },

    reschedule_today: async (input) => {
      const timezone = await resolveTimezone(supabase, userId, requestTimezone);
      const now = nowInTimezone(timezone);
      const todayKey = now.toISOString().slice(0, 10);

      // A future date is the "I can't train Monday" case. Only today was supported before, so the
      // model reached for this tool anyway and narrated a result it never got — including pairing
      // a weekday with a date that wasn't that weekday. The resolved weekday goes back in the
      // result so a mismatch is the model's to catch rather than to invent.
      const targetKey = typeof input.date === 'string' && input.date.length > 0 ? input.date : todayKey;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(targetKey)) {
        throw new Error('date must be YYYY-MM-DD. Nothing changed.');
      }
      if (targetKey < todayKey) {
        throw new Error(
          `${targetKey} is in the past — a day that has already been cannot be turned into a rest ` +
            'day. Nothing changed.',
        );
      }
      const targetDate = new Date(`${targetKey}T00:00:00Z`);
      const targetWeekday = targetDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
      const isToday = targetKey === todayKey;

      const { data: plan } = await supabase
        .from('training_plan')
        .select('starts_on, days_per_week, training_days, plan_session(id, day_order, weekday, focus)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (!plan) return { status: 'no_plan' };

      const [{ data: recentLogs }, restDayDates] = await Promise.all([
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
        fetchRestDayDates(supabase, userId, new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)),
      ]);
      const logs = logsInTimezone((recentLogs ?? []) as any[], timezone);
      const sessions = plan.plan_session ?? [];
      const override = await fetchDayOverrideSession(supabase, userId, targetKey);
      const dueToday = resolveTodaySession(
        sessions,
        logs,
        isToday ? now : targetDate,
        restDayDates,
        override,
        plan.starts_on ?? null,
        resolveTrainingDays(plan, sessions),
      );
      if (!dueToday) return { status: 'already_rest_day', date: targetKey, weekday: targetWeekday };

      const tokenSubject = `${dueToday.id}:${targetKey}`;
      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'reschedule_today', tokenSubject, input.confirm_token))) {
        return {
          status: 'preview',
          date: targetKey,
          weekday: targetWeekday,
          would_reschedule: { plan_session_id: dueToday.id, focus: humanizeFocus(dueToday.focus) },
          confirm_token: await issueConfirmToken(confirmSecret, 'reschedule_today', tokenSubject),
          instruction:
            `Nothing is saved yet. Confirm with the user that "${humanizeFocus(dueToday.focus)}" moves off ` +
            `${isToday ? 'today' : `${targetWeekday} ${targetKey}`} and becomes a rest day (the plan itself ` +
            'is unchanged — it resumes from this same session next time they train), then call ' +
            'reschedule_today again with confirm:true and this exact confirm_token.',
        };
      }

      // An override outranks a rest day by design, so writing one without clearing the override
      // would leave today still resolving as due — the exact "agreed to rest but Home still shows
      // a workout" contradiction this tool exists to prevent, just in the other direction.
      if (override) {
        const { error: overrideError } = await supabase
          .from('day_override')
          .delete()
          .eq('user_id', userId)
          .eq('date', targetKey);
        if (overrideError) throw new Error(`day_override delete: ${overrideError.message}`);
      }

      const { error } = await supabase
        .from('rest_day')
        .upsert(
          { user_id: userId, date: targetKey, plan_session_id: dueToday.id, reason: 'coach_reschedule' },
          { onConflict: 'user_id,date' },
        );
      if (error) throw new Error(`rest_day upsert: ${error.message}`);

      // Code-enforced proof, not an assumed side effect — re-resolve with the just-written rest
      // day in place and only report success if today genuinely comes back null.
      const stillDue = resolveTodaySession(
        sessions,
        logs,
        isToday ? now : targetDate,
        new Set([...restDayDates, targetKey]),
        undefined,
        plan.starts_on ?? null,
        resolveTrainingDays(plan, sessions),
      );
      if (stillDue) throw new Error(`reschedule_today: ${targetKey} still resolves as due after writing rest_day.`);

      return {
        status: 'rescheduled',
        rest_day_date: targetKey,
        weekday: targetWeekday,
        deferred_session: { plan_session_id: dueToday.id, focus: humanizeFocus(dueToday.focus) },
      };
    },

    note_consultation_covered: async (input) => {
      const requested = Array.isArray(input.topics) ? (input.topics as string[]) : [];
      const topics = requested.filter((t): t is ConsultationTopic =>
        (CONSULTATION_TOPICS as readonly string[]).includes(t),
      );
      if (topics.length === 0) return { status: 'noop' };

      const { data: existing } = await supabase
        .from('consultation_progress')
        .select('topics')
        .eq('user_id', userId)
        .maybeSingle();
      const covered = Array.from(new Set([...(existing?.topics ?? []), ...topics]));

      // The gate in writePlan trusts this table, so without a limit here the model can open its
      // own gate — confirmed live: told to "skip the questions" it marked all four topics covered
      // in a single call, having asked nothing, and went straight to building the plan. Each real
      // answer can legitimately settle at most two topics, so tying the ceiling to the number of
      // turns the user has actually taken makes a wholesale self-certification impossible while
      // leaving the genuine flow (two topics from a combined answer, then the rest) untouched.
      const { data: openerRow } = await supabase
        .from('message')
        .select('at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .eq('hidden', true)
        .order('at', { ascending: true })
        .limit(1)
        .maybeSingle();
      let userTurns = 0;
      if (openerRow?.at) {
        const { data: turnRows } = await supabase
          .from('message')
          .select('id')
          .eq('user_id', userId)
          .eq('role', 'user')
          .eq('hidden', false)
          .gt('at', openerRow.at);
        userTurns = turnRows?.length ?? 0;
      }
      const ceiling = Math.max(1, userTurns) * 2;
      if (covered.length > ceiling) {
        throw new Error(
          `Can't mark ${covered.length} topics covered yet — the user has only answered ${userTurns} ` +
            `time(s) since the consultation started, so at most ${ceiling} can be settled so far. ` +
            `Nothing was saved. Ask about what's still missing and call this again as each is genuinely ` +
            `answered (a clear "I don't know, use your judgment" counts as answered).`,
        );
      }

      const { error } = await supabase
        .from('consultation_progress')
        .upsert({ user_id: userId, topics: covered, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(`consultation_progress upsert: ${error.message}`);

      return { status: 'noted', covered, still_missing: missingConsultationTopics(covered) };
    },

    update_plan_start_date: async (input) => {
      const { data: plan } = await supabase
        .from('training_plan')
        .select('id, starts_on, days_per_week, training_days, plan_session(id, day_order, weekday)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (!plan) return { status: 'no_plan' };

      const timezone = await resolveTimezone(supabase, userId, requestTimezone);
      const todayKey = nowInTimezone(timezone).toISOString().slice(0, 10);
      if (!plan.starts_on || plan.starts_on <= todayKey) return { status: 'already_started' };

      const target = input.new_starts_on ?? todayKey;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
        throw new Error('new_starts_on must be YYYY-MM-DD. Nothing changed.');
      }
      const trainingDays = resolveTrainingDays(plan, plan.plan_session ?? []);
      const targetWeekday = weekdayOfKey(target);
      if (trainingDays.length > 0 && !trainingDays.includes(targetWeekday)) {
        const firstDay = firstTrainingDayOnOrAfter(target, trainingDays);
        return {
          status: 'rest_day',
          instruction:
            `Nothing changed. ${weekdayLabel(targetWeekday)} ${target} is a rest day in their plan ` +
            `(${describeTrainingDays(trainingDays)}). The first training day from then is ` +
            `${weekdayLabel(weekdayOfKey(firstDay))} ${firstDay}. Offer that, or offer to change their ` +
            'training days with update_training_days.',
        };
      }

      if (!input.confirm) {
        return {
          status: 'preview',
          would_start_on: target,
          instruction:
            `Nothing changed yet. Confirm they want the plan to start ${target} instead of ${plan.starts_on}, ` +
            'then call update_plan_start_date again with confirm:true.',
        };
      }

      const { error } = await supabase.from('training_plan').update({ starts_on: target }).eq('id', plan.id);
      if (error) throw new Error(`training_plan update: ${error.message}`);
      await writeAppAction(supabase, userId, 'refresh_home', { reason: 'start_date_changed' }).catch(() => {});
      return { status: 'updated', starts_on: target };
    },

    update_training_days: async (input) => {
      const trainingDays = parseTrainingDays(input.training_days);
      if (!trainingDays) {
        throw new Error('training_days must be a list of weekday names. Nothing changed.');
      }
      const { data: plan } = await supabase
        .from('training_plan')
        .select('id, starts_on')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (!plan) return { status: 'no_plan' };

      const update: Record<string, unknown> = { training_days: trainingDays, days_per_week: trainingDays.length };
      const timezone = await resolveTimezone(supabase, userId, requestTimezone);
      const todayKey = nowInTimezone(timezone).toISOString().slice(0, 10);
      let movedStart: string | null = null;
      if (plan.starts_on && plan.starts_on > todayKey && !trainingDays.includes(weekdayOfKey(plan.starts_on))) {
        movedStart = firstTrainingDayOnOrAfter(plan.starts_on, trainingDays);
        update.starts_on = movedStart;
      }

      const { error } = await supabase.from('training_plan').update(update).eq('id', plan.id);
      if (error) throw new Error(`training_plan update: ${error.message}`);
      await writeAppAction(supabase, userId, 'refresh_home', { reason: 'training_days_changed' }).catch(() => {});
      return {
        status: 'updated',
        schedule: describeTrainingDays(trainingDays),
        ...(movedStart ? { starts_on_moved_to: movedStart } : {}),
        instruction:
          'Saved. The sessions keep their order; the next one lands on the next training day. Say which ' +
          'days are training and rest days now' +
          (movedStart ? `, and that the plan now starts ${weekdayLabel(weekdayOfKey(movedStart))} ${movedStart}.` : '.'),
      };
    },

    create_custom_session: async (input) => {
      const timezone = await resolveTimezone(supabase, userId, requestTimezone);
      const todayKey = nowInTimezone(timezone).toISOString().slice(0, 10);

      const requested = (input.exercises ?? []) as {
        name: string;
        sets: number;
        rep_scheme: string;
        load_scheme?: string | null;
      }[];
      if (requested.length === 0) {
        return {
          status: 'rejected',
          reason: 'No exercises were given. A session needs at least one; nothing was created.',
        };
      }

      const names = requested.map((e) => e.name);
      const duplicates = names.filter((name, i) => names.findIndex((n) => n.toLowerCase() === name.toLowerCase()) !== i);
      if (duplicates.length > 0) {
        return {
          status: 'rejected',
          reason:
            `The same exercise appears more than once: ${[...new Set(duplicates)].join(', ')}. ` +
            'A session must list each exercise exactly once. Nothing was created — rebuild it with ' +
            'no repeats and call again.',
        };
      }
      const [injuries, exerciseByName, { data: recentLogsForCustomSession }] = await Promise.all([
        fetchActiveInjuries(supabase, userId),
        resolveExercises(supabase, names),
        supabase
          .from('workout_log')
          .select('at, exercises_done')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
      ]);
      const exercisesWithLoadHistoryForCustomSession = new Set(
        buildLoadHistory(recentLogsForCustomSession ?? []).map((h) => h.name.toLowerCase()),
      );

      // Same gate as writePlan, and deliberately returned as a tool result rather than thrown:
      // the model is expected to revise and call again, which it can only do if it's told exactly
      // what was wrong. A thrown error reads to it as a broken tool.
      const unknown = names.filter((name) => !exerciseByName.has(name));
      if (unknown.length > 0) {
        return {
          status: 'rejected',
          reason:
            `Not in the catalog: ${unknown.join(', ')}. Nothing was created. Do not pick a ` +
            `replacement yourself: tell the user each one isn't available, propose the closest ` +
            `catalog alternative, wait for them to agree to it (or name their own), and only then ` +
            'call this tool again with those confirmed names.',
        };
      }

      const violations = validatePlan(
        names.map((name) => ({ name, contraindicatedFor: exerciseByName.get(name)?.contraindicated_for ?? [] })),
        injuries,
      );
      if (violations.length > 0) {
        return {
          status: 'rejected',
          reason: `${explainViolations(violations)} Nothing was created — swap those out and call again.`,
        };
      }

      const invented = findInventedRepTargets(requested, options.currentUserText ?? null);
      if (invented.length > 0) {
        return {
          status: 'rejected',
          reason:
            `Nothing was created. The rep target you gave for ${invented.join(', ')} is just the set ` +
            `count repeated back — "x4" in their workout means four SETS and says nothing about reps, ` +
            `so a rep target of 4 is a number they never gave. Ask them what rep target they want on ` +
            `these, or use their logged history for each one and say that is what you did, then call ` +
            `again.`,
        };
      }

      const focus = humanizeFocus(input.focus);
      // Keyed on a fixed literal rather than the payload: an LLM won't reproduce a multi-exercise
      // structure byte-for-byte between the preview and confirm calls, and only one custom session
      // is ever pending at a time (same reasoning as writePlan's 'new_plan' key).
      const tokenKey = 'custom_session';
      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'create_custom_session', tokenKey, input.confirm_token))) {
        const omissions = (input.source_omissions ?? []) as string[];
        return {
          status: 'preview',
          focus,
          exercises: requested,
          source_omissions: omissions,
          confirm_token: await issueConfirmToken(confirmSecret, 'create_custom_session', tokenKey),
          instruction:
            `NOTHING HAS BEEN CREATED YET — do not tell the user they are all set, do not tell them ` +
            `to start it, and do not describe this session as existing. Read back the "${focus}" ` +
            `session (one line per exercise with sets and reps), say it replaces today's scheduled ` +
            `session and that the weekly plan itself is unchanged, wait for explicit agreement, then ` +
            `call create_custom_session again with the same fields plus confirm:true and this exact ` +
            `confirm_token.` +
            (omissions.length > 0
              ? ` You are leaving out ${omissions.length} thing${omissions.length === 1 ? '' : 's'} ` +
                `from what they gave you: ${omissions.join('; ')}. Say so in the same message, before ` +
                `they agree — not after. Ask what they want done about each one rather than deciding ` +
                `for them.`
              : ''),
        };
      }

      const { data: sessionId, error: rpcError } = await supabase.rpc('write_custom_session', {
        p_user_id: userId,
        p_focus: focus,
        p_date: todayKey,
        p_exercises: requested.map((e) => ({
          exercise_id: exerciseByName.get(e.name)!.id,
          sets: e.sets,
          rep_scheme: e.rep_scheme,
          load_scheme: loadSchemeForExercise(
            e.name,
            e.load_scheme,
            exercisesWithLoadHistoryForCustomSession.has(e.name.toLowerCase()),
          ),
        })),
      });
      if (rpcError) throw new Error(`write_custom_session: ${rpcError.message}`);

      // Code-enforced proof, not an assumed side effect — the whole reason this tool exists is
      // that the coach kept announcing a session that was never created. Re-resolve today the same
      // way every other consumer will, and only report success if it genuinely comes back as this
      // session. Anything else is a failure, however cleanly the write appeared to go.
      const override = await fetchDayOverrideSession(supabase, userId, todayKey);
      if (!override || override.id !== sessionId) {
        throw new Error('create_custom_session: session written but today does not resolve to it.');
      }

      await writeAppAction(supabase, userId, 'refresh_home', { reason: 'custom_session_created' });

      return {
        status: 'created',
        plan_session_id: sessionId,
        focus,
        exercises: requested,
        instruction:
          `The session now exists and is today's session — Home is showing it with a Start button. ` +
          `Tell them it's ready in one short line. Do not start it for them unless they ask; if they ` +
          `do ask, use start_todays_workout.`,
      };
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

      const sessions = plan.plan_session ?? [];
      const describeDay = (session: any) => ({
        plan_session_id: session.id as string,
        day_order: session.day_order as number,
        weekday: (session.weekday ?? null) as number | null,
        focus: humanizeFocus(session.focus),
        exercises: (session.plan_exercise ?? [])
          .slice()
          .sort((a: any, b: any) => a.ord - b.ord)
          .map((e: any) => e.exercise?.name)
          .filter(Boolean),
      });

      // Pinned (weekday-fixed) plans get a real 7-day Sun-Sat week, rest days included — the
      // client was showing "DAY 1..DAY 6" ordinals and a blanket "rest days aren't shown here"
      // disclaimer even for a plan that has real, fixed rest days, which read as hiding
      // information rather than a flexible split genuinely having none to show. A flexible
      // rotation has no fixed weekday by definition, so it keeps the day-order ordinal listing —
      // CalendarScreen's useWeekCalendar projects a flexible rotation onto real dates for the
      // week view, but duplicating that projection here for a routine/plan-level chat card isn't
      // worth the duplication; the honest "day order, not weekday" framing stays instead.
      const pinned = sessions.some((s: any) => s.weekday !== null && s.weekday !== undefined);
      let days: any[];
      if (pinned) {
        const byWeekday = new Map(sessions.map((s: any) => [s.weekday, s]));
        days = Array.from({ length: 7 }, (_, weekday) => {
          const session = byWeekday.get(weekday);
          return session
            ? describeDay(session)
            : { plan_session_id: null, day_order: -1, weekday, focus: 'Rest', exercises: [] };
        });
      } else {
        days = sessions
          .slice()
          .sort((a: any, b: any) => a.day_order - b.day_order)
          .map(describeDay);
      }

      return {
        status: 'shown',
        card: {
          type: 'plan_breakdown',
          split: plan.split,
          days_per_week: plan.days_per_week,
          schedule_type: pinned ? 'pinned' : 'flexible',
          days,
        },
      };
    },

    show_daily_workout: async () => {
      const { data: plan, error } = await supabase
        .from('training_plan')
        .select('starts_on, days_per_week, training_days, plan_session(id, day_order, weekday, focus, plan_exercise(ord, sets, rep_scheme, exercise(name)))')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();
      if (error) throw new Error(`training_plan fetch: ${error.message}`);

      const sessions = plan?.plan_session ?? [];
      const [timezone, { data: recentLogs }, restDayDates] = await Promise.all([
        resolveTimezone(supabase, userId, requestTimezone),
        supabase
          .from('workout_log')
          .select('at, plan_session_id, status')
          .eq('user_id', userId)
          .order('at', { ascending: false })
          .limit(10),
        // This call was resolving today with neither rest days nor the override, so the card it
        // returned could name a session Home had already moved off — the coach showing one
        // workout while the screen showed another.
        fetchRestDayDates(supabase, userId, new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)),
      ]);
      const now = nowInTimezone(timezone);
      const override = await fetchDayOverrideSession(supabase, userId, now.toISOString().slice(0, 10));
      if (sessions.length === 0 && !override) return { status: 'no_session', reason: 'no_active_plan' };

      const today = resolveTodaySession(
        sessions,
        logsInTimezone(recentLogs ?? [], timezone),
        now,
        restDayDates,
        override,
        plan?.starts_on ?? null,
        resolveTrainingDays(plan, sessions),
      );
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
          : snapshot.caloriesToday > snapshot.caloriesTarget
            ? `You're ${snapshot.caloriesToday - snapshot.caloriesTarget} calories over today's target, so keep anything else light.`
            : proteinRemaining <= 0
              ? 'Protein target hit for today — nice work.'
              : snapshot.caloriesLeft <= 0
                ? "You're right at your calorie target for today, so keep the rest light."
                : 'Still some room on protein today — a meal with lean protein would close the gap fast.';
      return {
        status: 'shown',
        card: {
          type: 'nutrition_summary',
          calories_left: snapshot.caloriesLeft,
          calories_target: snapshot.caloriesTarget,
          calories_consumed: snapshot.caloriesToday,
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
      const units = await resolveUnits();
      const lifts = snapshot.topLifts.map((lift: { name: string; top_weight_kg: number }) => ({
        name: lift.name,
        top_weight_label:
          units === 'imperial'
            ? `${Math.round(lift.top_weight_kg * 2.20462 * 10) / 10} lb`
            : `${lift.top_weight_kg} kg`,
      }));
      const insight =
        lifts.length > 0 ? `${lifts[0].name} is leading the pack — keep chasing progressive overload.` : '';
      return {
        status: 'shown',
        card: {
          type: 'top_lifts',
          lifts,
          insight,
        },
      };
    },

    show_previous_workout: async () => {
      const { data: log, error } = await supabase
        .from('workout_log')
        .select('at, status, exercises_done, duration_sec, session_type, cardio_activity, plan_session_id, switched_from_session_id')
        .eq('user_id', userId)
        .order('at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`workout_log fetch: ${error.message}`);
      if (!log) return { status: 'no_workout', reason: 'none_logged' };

      const exercisesDone = (log.exercises_done ?? []) as { name: string; sets?: number; reps: string; load: string }[];
      const totalSets = exercisesDone.reduce((sum, ex) => sum + (ex.sets ?? 0), 0);

      let dayLabel = log.cardio_activity ? humanizeFocus(log.cardio_activity) : 'Workout';
      let targetSets = totalSets;

      if (log.plan_session_id) {
        const { data: session } = await supabase
          .from('plan_session')
          .select('focus, plan_exercise(sets)')
          .eq('id', log.plan_session_id)
          .maybeSingle();
        if (session) {
          dayLabel = humanizeFocus(session.focus);
          targetSets = (session.plan_exercise ?? []).reduce((sum: number, e: any) => sum + (e.sets ?? 0), 0);
        }
      }

      const status = log.switched_from_session_id ? 'switched' : log.status;

      return {
        status: 'shown',
        card: {
          type: 'previous_workout',
          day_label: dayLabel,
          status,
          total_sets: totalSets,
          target_sets: targetSets,
          top_set_label: topSetLabelFor(exercisesDone, await resolveUnits()),
          duration_sec: log.duration_sec ?? null,
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

      const isSafe = (c: any) => !(c.contraindicated_for ?? []).some((tag: string) => forbidden.has(tag));

      let chosen: any = null;
      const requestedName = String(input.replacement_exercise_name ?? '').trim();
      if (requestedName) {
        const requested = (candidates ?? []).find(
          (c: any) => String(c.name).toLowerCase() === requestedName.toLowerCase(),
        );
        if (!requested) {
          return {
            status: 'replacement_not_available',
            requested: requestedName,
            alternatives: (candidates ?? []).filter(isSafe).map((c: any) => c.name),
            instruction:
              `Nothing was changed. "${requestedName}" is not a catalog exercise that trains the same ` +
              `pattern as ${input.current_exercise_name}. Tell the user that plainly, offer the ` +
              `alternatives listed here, and call swap_exercise again once they pick one.`,
          };
        }
        if (!isSafe(requested)) {
          return {
            status: 'replacement_unsafe',
            requested: requestedName,
            alternatives: (candidates ?? []).filter(isSafe).map((c: any) => c.name),
            instruction:
              `Nothing was changed. "${requestedName}" loads an area the user is currently injured in. ` +
              `Say so plainly, offer the alternatives listed here, and call swap_exercise again once ` +
              `they pick one.`,
          };
        }
        chosen = requested;
      } else {
        chosen = (candidates ?? []).find(isSafe);
      }
      if (!chosen) return { status: 'no_safe_alternative' };

      const live = await readLiveSession(supabase, userId);
      if (live.running) {
        const liveNames = ((live.state?.exercises ?? []) as { name?: string }[]).map((e) => String(e?.name ?? ''));
        const fromIndex = Number(live.state?.currentExerciseIndex ?? 0);
        const wanted = String(input.current_exercise_name ?? '').trim().toLowerCase();
        const targetIndex = liveNames.findIndex((n, i) => i >= fromIndex && n.toLowerCase() === wanted);
        if (targetIndex === -1) {
          return {
            status: 'not_in_session',
            session_exercises: liveNames.slice(fromIndex),
            instruction:
              `Nothing was changed. "${input.current_exercise_name}" is not the current or an upcoming ` +
              'exercise in the workout that is running right now (listed here). Ask which one they meant.',
          };
        }
        if (liveNames.some((n) => n.toLowerCase() === chosen.name.toLowerCase())) {
          return {
            status: 'already_in_session',
            replacement: chosen.name,
            instruction:
              `Nothing was changed. ${chosen.name} is already in this workout, so swapping to it would ` +
              'list it twice. Offer a different replacement.',
          };
        }
        await writeAppAction(supabase, userId, 'swap_exercise', {
          from_name: liveNames[targetIndex],
          to_exercise_id: chosen.id,
          to_name: chosen.name,
          load_scheme: isBodyweightExercise(chosen.name) ? 'bodyweight' : null,
        });
        const landed = await waitForExerciseAt(supabase, userId, chosen.name);
        if (!landed) {
          return {
            status: 'not_confirmed',
            replacement: chosen.name,
            instruction:
              `The swap was sent but the app has NOT confirmed it. Do not say the exercise changed. ` +
              `Tell them you are switching it to ${chosen.name} and to check the card.`,
          };
        }
        return {
          status: 'swapped',
          replaced: liveNames[targetIndex],
          replacement: chosen.name,
          was_user_choice: !!requestedName,
          instruction:
            `The workout card now shows ${chosen.name} in place of ${liveNames[targetIndex]}. Sets already ` +
            `logged stay recorded under ${liveNames[targetIndex]}. Confirm the change in one short line.`,
        };
      }

      const timezone = await resolveTimezone(supabase, userId, requestTimezone);
      const todayKey = nowInTimezone(timezone).toISOString().slice(0, 10);
      const today = await resolveTodaysExercises(supabase, userId, timezone);
      if (!today) {
        return {
          status: 'no_session_today',
          instruction:
            'Nothing was changed. There is no session scheduled today to swap an exercise in. Tell the ' +
            'user that, and offer create_custom_session if they want a one-off workout instead.',
        };
      }

      const target = today.exercises.find(
        (e: TodaysExercise) => e.name.toLowerCase() === String(input.current_exercise_name).toLowerCase(),
      );
      if (!target) {
        return {
          status: 'not_in_todays_session',
          todays_exercises: today.exercises.map((e: TodaysExercise) => e.name),
          instruction:
            `Nothing was changed. "${input.current_exercise_name}" is not in today's session. Tell the ` +
            'user what today actually has (listed here) and ask which one they meant.',
        };
      }

      if (today.exercises.some((e: TodaysExercise) => e.name.toLowerCase() === chosen.name.toLowerCase())) {
        return {
          status: 'already_in_session',
          replacement: chosen.name,
          instruction:
            `Nothing was changed. ${chosen.name} is already in today's session, so swapping ` +
            `${input.current_exercise_name} to it would list it twice. Offer a different replacement.`,
        };
      }

      const loadSchemeFor = (replacement: string, previous: string | null): string | null => {
        if (isBodyweightExercise(replacement)) return 'bodyweight';
        if (previous && previous.trim().toLowerCase() === 'bodyweight') {
          return 'light — find your working weight';
        }
        return previous;
      };

      const swapped = today.exercises.map((e: TodaysExercise) =>
        e.name.toLowerCase() === target.name.toLowerCase()
          ? {
              ...e,
              exercise_id: chosen.id,
              name: chosen.name,
              load_scheme: loadSchemeFor(chosen.name, e.load_scheme),
            }
          : e,
      );

      const { data: sessionId, error: swapRpcError } = await supabase.rpc('write_custom_session', {
        p_user_id: userId,
        p_focus: today.focus,
        p_date: todayKey,
        p_exercises: swapped.map((e: TodaysExercise) => ({
          exercise_id: e.exercise_id,
          sets: e.sets,
          rep_scheme: e.rep_scheme,
          load_scheme: e.load_scheme ?? null,
        })),
      });
      if (swapRpcError) throw new Error(`swap_exercise write_custom_session: ${swapRpcError.message}`);

      const override = await fetchDayOverrideSession(supabase, userId, todayKey);
      if (!override || override.id !== sessionId) {
        throw new Error('swap_exercise: session written but today does not resolve to it.');
      }

      return {
        status: 'swapped_for_today',
        replaced: target.name,
        replacement: chosen.name,
        was_user_choice: !!requestedName,
        todays_exercises: swapped.map((e: TodaysExercise) => e.name),
        instruction:
          `Today's session now has ${chosen.name} in place of ${target.name}; everything else is ` +
          'unchanged and the training plan itself is untouched. Confirm just that one change in a ' +
          'single short sentence. Do NOT list the whole session back.',
      };
    },

    skip_exercise: async () => {
      await writeAppAction(supabase, userId, 'skip_exercise', {});
      return { status: 'requested' };
    },

    go_to_exercise: async (input) => {
      const { data: liveRow } = await supabase
        .from('live_session_state')
        .select('updated_at, state')
        .eq('user_id', userId)
        .maybeSingle();
      const isLive = liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
      if (!isLive) {
        return {
          status: 'no_session',
          instruction:
            'Nothing was changed. There is no workout running in the app right now, so there is no ' +
            'exercise to move to.',
        };
      }

      const names: string[] = ((liveRow.state?.exercises ?? []) as { name?: string }[])
        .map((e) => String(e?.name ?? ''))
        .filter(Boolean);
      const requested = String(input.exercise_name ?? '').trim();
      const match = matchSessionExercise(names, requested);

      if (match.kind === 'ambiguous') {
        return {
          status: 'ambiguous',
          candidates: match.candidates,
          instruction:
            `Nothing was changed. "${requested}" could mean more than one exercise in this session: ` +
            `${match.candidates.join(', ')}. Ask which one they meant and call again with that name.`,
        };
      }
      if (match.kind === 'not_found') {
        return {
          status: 'not_in_session',
          session_exercises: names,
          instruction:
            `Nothing was changed. "${requested}" is not one of the exercises in this workout. Tell ` +
            'the user what the session actually contains (listed here) and ask which of those they ' +
            'meant — never move them to an exercise they did not name.',
        };
      }

      const targetIndex = names.findIndex((n) => n === match.name);
      if (targetIndex === liveRow.state?.currentExerciseIndex) {
        return {
          status: 'already_there',
          exercise_name: match.name,
          instruction:
            `Nothing was changed because ${match.name} is ALREADY the current exercise on their ` +
            `screen. Do not say you moved or switched anything — confirm they are on it and carry on.`,
        };
      }

      await writeAppAction(supabase, userId, 'go_to_exercise', { exercise_name: match.name });

      const landed = await waitForExerciseIndex(supabase, userId, targetIndex);
      if (!landed) {
        return {
          status: 'not_confirmed',
          exercise_name: match.name,
          instruction:
            `The request was sent but the app has NOT confirmed the move yet. Do not tell the user ` +
            `they are on ${match.name} — say you are moving them there and to check the card, and ` +
            `believe the live session state block over your own request from here on.`,
        };
      }
      return { status: 'moved', exercise_name: match.name };
    },

    add_set: async () => {
      await writeAppAction(supabase, userId, 'add_set', {});
      return { status: 'requested' };
    },

    log_live_set: async (input) => {
      if (options.appLoggedThisTurn) {
        return {
          status: 'already_logged',
          instruction:
            'Nothing new was logged: the app already logged this set from what they just said, and it ' +
            'is recorded. Confirm that one set; never log it a second time.',
        };
      }

      const live = await readLiveSession(supabase, userId);
      if (!live.running) {
        return {
          status: 'no_session',
          instruction: 'Nothing was logged. There is no workout running in the app right now.',
        };
      }

      if (!(await userClaimedSetFinished(supabase, userId, options.currentUserText ?? null))) {
        return {
          status: 'not_finished',
          instruction:
            'Nothing was logged. The user has not said they finished a set, so this would record one ' +
            'they are still doing — counting reps out loud is not a report. Ask them to tell you when ' +
            'the set is done and how many reps they got, then log it.',
        };
      }

      const reps = Math.round(Number(input.reps));
      if (!Number.isFinite(reps) || reps <= 0) return { status: 'invalid_reps' };

      const rawWeight = typeof input.weight === 'number' ? input.weight : null;
      const weightKg =
        rawWeight === null || rawWeight <= 0
          ? null
          : input.weight_unit === 'lb'
            ? Math.round(rawWeight * 0.453592 * 10) / 10
            : rawWeight;

      const resolved = resolveToolSetWeight(live.snapshot, weightKg, !!input.timed);
      if ('needsWeightFor' in resolved) {
        return {
          status: 'needs_weight',
          instruction:
            `Nothing was logged. No weight is known yet for ${resolved.needsWeightFor}, so ask them what ` +
            `weight they used for those ${reps} reps, then call log_live_set with the reps and the weight. ` +
            'Never log a loaded lift without a weight.',
        };
      }

      const before = totalLoggedSets(live.state);
      await writeAppAction(supabase, userId, 'log_set', {
        reps,
        weight_kg: resolved.weight,
        unit: input.timed ? 'seconds' : null,
      });
      if (!(await waitForLoggedSetTotal(supabase, userId, before + 1))) {
        return {
          status: 'not_confirmed',
          instruction:
            'The set was sent but the app has NOT confirmed it landed. Do not say it is logged or that ' +
            'rest has started. Ask them to check the card; the live session state block is the truth.',
        };
      }
      return { status: 'logged', reps, weight_kg: resolved.weight };
    },

    end_workout: async (input) => {
      // Damion's explicit ask: ending or discarding an incomplete workout needs confirmation —
      // unlike the moment-to-moment commands (report a set, adjust rest, pause/resume), this one
      // is hard to walk back once the session screen actually closes.
      const live = await readLiveSession(supabase, userId);
      if (!live.running) {
        return {
          status: 'no_session',
          instruction: 'Nothing was ended. There is no workout running in the app right now.',
        };
      }
      const currentExercise = live.snapshot?.currentExercise ?? null;
      const setsLogged = totalLoggedSets(live.state);
      const tokenKey = `${currentExercise?.name ?? ''}:${setsLogged}`;

      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'end_workout', tokenKey, input.confirm_token))) {
        return {
          status: 'preview',
          current_exercise: currentExercise?.name ?? null,
          sets_logged: setsLogged,
          confirm_token: await issueConfirmToken(confirmSecret, 'end_workout', tokenKey),
          instruction:
            'Nothing has ended yet. Confirm with the user that they want to end the workout now — say ' +
            'plainly whether that means saving it as complete or as a partial session — then call ' +
            'end_workout again with the same completed value, confirm:true, and this exact confirm_token.',
        };
      }

      await writeAppAction(supabase, userId, 'end_workout', {
        status: input.completed ? 'completed' : 'partial',
        reason: String(input.reason ?? '').trim() || null,
      });
      return { status: 'requested' };
    },

    discard_workout: async (input) => {
      const live = await readLiveSession(supabase, userId);
      if (!live.running) {
        return {
          status: 'no_session',
          instruction:
            'Nothing was deleted. There is no workout running in the app right now. If they mean a workout ' +
            'saved earlier, say you cannot delete saved workouts from here.',
        };
      }
      const focus = live.snapshot?.focus ? humanizeFocus(live.snapshot.focus) : 'this workout';
      const setsLogged = totalLoggedSets(live.state);
      const tokenKey = `${live.snapshot?.focus ?? ''}:${setsLogged}`;

      if (!input.confirm || !(await verifyConfirmToken(confirmSecret, 'discard_workout', tokenKey, input.confirm_token))) {
        return {
          status: 'preview',
          focus,
          sets_that_would_be_deleted: setsLogged,
          confirm_token: await issueConfirmToken(confirmSecret, 'discard_workout', tokenKey),
          instruction:
            `Nothing is deleted yet. Confirm they want to throw away ${focus} completely` +
            (setsLogged > 0 ? `, including the ${setsLogged} set${setsLogged === 1 ? '' : 's'} logged` : '') +
            ', with nothing saved, then call discard_workout again with confirm:true and this exact confirm_token.',
        };
      }

      await writeAppAction(supabase, userId, 'discard_workout', {});
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (!(await readLiveSession(supabase, userId)).running) {
          return {
            status: 'discarded',
            instruction:
              'The workout is gone from the app and nothing from it was saved. Say so in one short line. ' +
              'Their plan is unchanged, so the same session is still next.',
          };
        }
      }
      return {
        status: 'not_confirmed',
        instruction:
          'The discard was sent but the app has NOT confirmed it. Do not say it was deleted. Ask them to ' +
          'check whether the workout screen closed.',
      };
    },

    adjust_rest_timer: async (input) => {
      const seconds =
        typeof input.seconds === 'number' ? Math.min(120, Math.max(1, Math.round(input.seconds))) : null;
      await writeAppAction(supabase, userId, 'adjust_rest_timer', { action: input.action, seconds });
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

  return Object.fromEntries(
    Object.entries(handlers).map(([name, run]) => [
      name,
      async (input: any) => localizeWeights(await run(input), await resolveUnits()),
    ]),
  );
}
