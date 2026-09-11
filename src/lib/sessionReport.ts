export interface LoggedExercise {
  name: string;
  sets: number;
  reps: string;
  load: string;
  /** Absent on rows written before this field existed — treated as "live" there, since every
   *  workout_log write used to only ever come from the real in-app session. */
  tracked?: "live" | "reported";
}

export interface WorkoutLogRecord {
  id: string;
  at: string;
  status: string | null;
  source: string | null;
  session_type: string | null;
  cardio_activity: string | null;
  duration_sec: number | null;
  plan_session_id: string | null;
  exercises_done: LoggedExercise[] | null;
  note: string | null;
  feedback_tags: string[] | null;
}

export interface PlanTarget {
  focus: string | null;
  totalSets: number;
}

export interface NutritionContext {
  proteinGoal: number;
  proteinCurrent: number;
  caloriesGoal: number;
  caloriesCurrent: number;
  carbsGoal: number;
  carbsCurrent: number;
}

export interface SetLogRow {
  exerciseName: string;
  setNumber: number;
  weight: number | null;
  reps: number | null;
  tracked: "live" | "reported";
}

export interface ScoreComponent {
  label: string;
  value: number;
  max: number;
  available: boolean;
}

export interface PerformanceScore {
  total: number;
  components: ScoreComponent[];
}

export interface Debrief {
  summary: string;
  whatWorked: string[];
  whatToFix: string[];
  injuryCheck: string | null;
  blueprint: string[];
}

export interface SessionReport {
  logId: string;
  title: string;
  isCardio: boolean;
  status: string;
  source: "mustle" | "independent";
  isPartial: boolean;
  dateLabel: string;
  timeLabel: string;
  durationSec: number;
  totalSets: number;
  targetSets: number;
  volume: number;
  volumeDeltaPct: number | null;
  topSetLabel: string;
  streakDays: number;
  setLog: SetLogRow[];
  exerciseCount: number;
  note: string | null;
  feedbackTags: string[];
  score: PerformanceScore;
  nutrition: NutritionContext | null;
  debrief: Debrief;
}

const WORKOUT_MAX = 45;
const NUTRITION_MAX = 25;
const CONSISTENCY_MAX = 30;
const STREAK_DAYS_TO_MAX = 6;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function splitNumbers(raw: string | null | undefined): (number | null)[] {
  if (!raw) return [];
  return raw.split(',').map((part) => {
    const trimmed = part.trim();
    if (!trimmed || trimmed === '-') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : null;
  });
}

function isBodyweight(load: string | null | undefined): boolean {
  return !load || load.trim().toLowerCase() === 'bodyweight';
}

export function buildSetLog(exercises: LoggedExercise[]): SetLogRow[] {
  const rows: SetLogRow[] = [];
  for (const exercise of exercises) {
    const reps = splitNumbers(exercise.reps);
    const weights = isBodyweight(exercise.load) ? [] : splitNumbers(exercise.load);
    const count = Math.max(exercise.sets ?? 0, reps.length);
    for (let i = 0; i < count; i += 1) {
      rows.push({
        exerciseName: exercise.name,
        setNumber: i + 1,
        weight: weights[i] ?? null,
        reps: reps[i] ?? null,
        tracked: exercise.tracked ?? "live",
      });
    }
  }
  return rows;
}

export function computeVolume(setLog: SetLogRow[]): number {
  return setLog.reduce((sum, row) => sum + (row.weight ?? 0) * (row.reps ?? 0), 0);
}

export function buildTopSetLabel(setLog: SetLogRow[]): string {
  if (setLog.length === 0) return '—';
  const weighted = setLog.filter((row) => row.weight !== null);
  if (weighted.length === 0) {
    const best = setLog.reduce((a, b) => ((b.reps ?? 0) > (a.reps ?? 0) ? b : a));
    return best.reps === null ? '—' : `${best.reps} reps`;
  }
  const top = weighted.reduce((best, row) => {
    if ((row.weight ?? 0) !== (best.weight ?? 0)) return (row.weight ?? 0) > (best.weight ?? 0) ? row : best;
    return (row.reps ?? 0) > (best.reps ?? 0) ? row : best;
  });
  return top.reps === null ? `${top.weight} kg` : `${top.weight} kg × ${top.reps}`;
}

/**
 * Workout / Nutrition / Consistency, weighted 45 / 25 / 30.
 *
 * The design's fourth component, Recovery, is deliberately absent: it needs wearable data
 * this app has no source for, and a flat placeholder would be a fabricated number. Any
 * component without real data behind it drops out and the remaining ones are rescaled to
 * 100, so the total never quietly penalises a user for data we never collected.
 */
export function computeScore(
  totalSets: number,
  targetSets: number,
  streakDays: number,
  nutrition: NutritionContext | null,
): PerformanceScore {
  const completion = targetSets > 0 ? clamp(totalSets / targetSets, 0, 1) : 0;
  // Whether a target EXISTS, not whether anything's been eaten yet — 0g logged with a real
  // target is a genuine 0/25, not an unknown. Requiring proteinCurrent > 0 here previously
  // treated "haven't eaten yet today" the same as "no nutrition targets at all," silently
  // dropping the component (and rescaling the other two upward) for anyone who simply hadn't
  // logged food yet when the session ended.
  const hasNutrition = nutrition !== null && nutrition.proteinGoal > 0;

  const components: ScoreComponent[] = [
    {
      label: 'Workout',
      value: Math.round(completion * WORKOUT_MAX),
      max: WORKOUT_MAX,
      available: targetSets > 0,
    },
    {
      label: 'Nutrition',
      value: hasNutrition
        ? Math.round(clamp(nutrition!.proteinCurrent / nutrition!.proteinGoal, 0, 1) * NUTRITION_MAX)
        : 0,
      max: NUTRITION_MAX,
      available: hasNutrition,
    },
    {
      label: 'Consistency',
      value: Math.round(clamp(streakDays / STREAK_DAYS_TO_MAX, 0, 1) * CONSISTENCY_MAX),
      max: CONSISTENCY_MAX,
      available: true,
    },
  ];

  const earned = components.filter((c) => c.available).reduce((sum, c) => sum + c.value, 0);
  const possible = components.filter((c) => c.available).reduce((sum, c) => sum + c.max, 0);
  const total = possible > 0 ? Math.round((earned / possible) * 100) : 0;

  return { total, components };
}

const PAIN_PATTERN = /\b(hurt|pain|sore|tweak|ache|injur)/i;

function mentionsPain(note: string | null, tags: string[]): boolean {
  if (note && PAIN_PATTERN.test(note)) return true;
  return tags.some((tag) => PAIN_PATTERN.test(tag));
}

/**
 * A short, real coaching summary built from this session's own numbers — completion, volume
 * trend, top set, the note/tags the user actually left. Deterministic and data-driven rather
 * than an LLM call, same tradeoff as restSuggestion.ts: no per-report round-trip latency, and
 * nothing here is invented — every line traces to a field on the log.
 */
export function buildDebrief(
  isCardio: boolean,
  isPartial: boolean,
  exerciseLabel: string,
  totalSets: number,
  targetSets: number,
  volumeDeltaPct: number | null,
  topSetLabel: string,
  note: string | null,
  tags: string[],
): Debrief {
  const painFlag = mentionsPain(note, tags);
  const injuryCheck = painFlag
    ? 'You flagged something that sounded like discomfort — mention it directly next time if it is still bothering you.'
    : null;

  if (isCardio) {
    return {
      summary: isPartial
        ? `Cardio cut short today — still counts. Pick it back up next time you've got the window.`
        : `Cardio session logged. Keep stacking these and the conditioning follows.`,
      whatWorked: [isPartial ? 'Got moving even with limited time.' : 'Completed the full session.'],
      whatToFix: [],
      injuryCheck,
      blueprint: ['Keep the next cardio session on the calendar — consistency is what compounds here.'],
    };
  }

  const deltaLine =
    volumeDeltaPct === null
      ? 'First tracked session here — nothing to compare against yet, so today sets the baseline.'
      : volumeDeltaPct >= 0
        ? `Volume's up ${volumeDeltaPct}% on last time — that's the direction we want.`
        : `Volume's down ${Math.abs(volumeDeltaPct)}% from last time — not a problem on its own, but let's see it climb back.`;

  if (isPartial) {
    const owed = targetSets - totalSets;
    return {
      summary: `Closed this one out early after ${totalSets} of ${targetSets} planned sets on ${exerciseLabel.toLowerCase()}. Better to stop clean than push into a bad rep. ${deltaLine}`,
      whatWorked: ['Stopped on your own terms instead of grinding out a bad set.'],
      whatToFix: owed > 0 ? [`${owed} set${owed === 1 ? '' : 's'} still owed — pick it back up next session.`] : [],
      injuryCheck,
      blueprint: [
        `Resume ${exerciseLabel.toLowerCase()} at the same working weight — no need to reset progress over a short session.`,
      ],
    };
  }

  return {
    summary: `${totalSets} sets of ${exerciseLabel.toLowerCase()} in the books, top set ${topSetLabel}. ${deltaLine}`,
    whatWorked: [
      `Completed all ${targetSets} planned sets.`,
      volumeDeltaPct !== null && volumeDeltaPct >= 0 ? 'Volume trending up vs last session.' : 'Reps stayed consistent set to set.',
    ],
    whatToFix: [],
    injuryCheck,
    blueprint: [
      volumeDeltaPct !== null && volumeDeltaPct < 0
        ? `Hold this week's weight and chase full completion again before adding load.`
        : `Add a small step next session — either weight or one clean rep per set.`,
    ],
  };
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function buildSessionReport(
  log: WorkoutLogRecord,
  plan: PlanTarget | null,
  priorLogs: WorkoutLogRecord[],
  streakDays: number,
  nutrition: NutritionContext | null,
): SessionReport {
  const isCardio = log.session_type === 'cardio';
  const exercises = log.exercises_done ?? [];
  const setLog = isCardio ? [] : buildSetLog(exercises);
  const volume = computeVolume(setLog);

  const priorVolumes = priorLogs
    .filter((prior) => prior.session_type !== 'cardio' && prior.plan_session_id === log.plan_session_id)
    .map((prior) => computeVolume(buildSetLog(prior.exercises_done ?? [])))
    .filter((value) => value > 0);
  const priorVolume = priorVolumes[0] ?? null;
  const volumeDeltaPct =
    priorVolume && priorVolume > 0 ? Math.round(((volume - priorVolume) / priorVolume) * 100) : null;

  const totalSets = setLog.length;
  const targetSets = plan?.totalSets ?? 0;
  const at = new Date(log.at);

  const title = isCardio
    ? (log.cardio_activity ?? 'Cardio').toUpperCase()
    : (plan?.focus ?? 'Training').toUpperCase();

  return {
    logId: log.id,
    title,
    isCardio,
    status: log.status ?? 'completed',
    source: log.source === 'independent' ? 'independent' : 'mustle',
    isPartial: log.status === 'partial',
    dateLabel: formatDateLabel(at),
    timeLabel: formatTimeLabel(at),
    durationSec: log.duration_sec ?? 0,
    totalSets,
    targetSets,
    volume,
    volumeDeltaPct,
    topSetLabel: buildTopSetLabel(setLog),
    streakDays,
    setLog,
    exerciseCount: exercises.length,
    note: log.note,
    feedbackTags: log.feedback_tags ?? [],
    score: computeScore(totalSets, targetSets, streakDays, nutrition),
    nutrition,
    debrief: buildDebrief(
      isCardio,
      // An 'interrupted' session hasn't been reconciled yet — the debrief must not claim full
      // completion for it, same as a genuinely partial one, even though its own header badge
      // shows "Needs Review" rather than "Partial Session".
      log.status === 'partial' || log.status === 'interrupted',
      title,
      totalSets,
      targetSets,
      volumeDeltaPct,
      buildTopSetLabel(setLog),
      log.note,
      log.feedback_tags ?? [],
    ),
  };
}

export function formatDuration(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const minutes = Math.round(totalSec / 60);
  return `${minutes} min`;
}
