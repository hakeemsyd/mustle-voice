import { supabase } from './supabase';
import { setCachedDisplayName } from './profileStore';

export type BrainModality = 'voice' | 'text' | 'image' | 'file' | 'live_photo';

export interface PlanBreakdownCard {
  type: 'plan_breakdown';
  split: string;
  days_per_week: number;
  /** 'pinned' plans get a full 7-day week (days.length === 7, Sun-Sat order, rest days included
   *  as plan_session_id: null); 'flexible' plans have no fixed weekday, so days are the rotation
   *  in day_order — no synthetic rest rows since there's no fixed day to hang one on. */
  schedule_type: 'pinned' | 'flexible';
  days: {
    plan_session_id: string | null;
    day_order: number;
    weekday: number | null;
    focus: string;
    exercises: string[];
  }[];
}

export interface DailyWorkoutCard {
  type: 'daily_workout';
  plan_session_id: string;
  day_label: string;
  estimated_minutes: number;
  exercises: {
    name: string;
    sets: number;
    reps: string;
    rest_sec: number;
  }[];
}

export interface NutritionSummaryCard {
  type: 'nutrition_summary';
  calories_left: number;
  calories_target: number;
  /** `current` is a real sum of today's food_log rows — the same records the Fuel screen reads,
   *  never estimated from the calories-consumed ratio. */
  macros: { label: string; target: number; current: number; unit: string }[];
  insight: string;
}

export interface ProgressReportCard {
  type: 'progress_report';
  score: number;
  delta_label: string;
  trend: number[];
  trend_labels: string[];
  insight: string;
}

export interface ReadinessCard {
  type: 'readiness';
  score: number;
  label: string;
  trend_label: string;
  insight: string;
}

export interface TopLiftsCard {
  type: 'top_lifts';
  lifts: { name: string; top_weight_lb: number }[];
  insight: string;
}

export interface PreviousWorkoutCard {
  type: 'previous_workout';
  day_label: string;
  status: 'completed' | 'partial' | 'switched';
  total_sets: number;
  target_sets: number;
  top_set_label: string;
  duration_sec: number | null;
}

export type ChatCard =
  | PlanBreakdownCard
  | DailyWorkoutCard
  | NutritionSummaryCard
  | ProgressReportCard
  | ReadinessCard
  | TopLiftsCard
  | PreviousWorkoutCard;

export interface BrainResult {
  reply: string;
  toolCalls: string[];
  card?: ChatCard | null;
  updatedDisplayName?: string | null;
}

const BRAIN_TIMEOUT_MS = 25000;

export const COACH_UNREACHABLE_MESSAGE = "Couldn't reach the coach — try again in a moment.";

export async function callBrain(
  userId: string,
  message: string,
  modality: BrainModality = 'text',
  hidden: boolean = false,
  timeoutMs: number = BRAIN_TIMEOUT_MS,
  liveSessionState?: string,
  attachmentUrl?: string,
  // Home's daily-greeting call only — tells the server to skip its usual "new vs. ongoing
  // conversation" note, which otherwise contradicts buildGreetingPrompt's own explicit "say hello"
  // instruction for any user with prior history (nearly everyone). See buildSystemPrompt's own
  // comment in brain-config.ts for the full story.
  isDailyGreeting: boolean = false,
): Promise<BrainResult> {
  // The device's own current timezone, sent every call — profile.timezone is only written once
  // at onboarding and never refreshed, which silently drifted after travel/DST and misclassified
  // which local day a meal or workout fell on (confirmed live). The backend prefers this over the
  // stored value and opportunistically refreshes it too.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error } = await supabase.functions.invoke('brain', {
    body: { userId, message, modality, hidden, liveSessionState, timezone, attachmentUrl, isDailyGreeting },
    timeout: timeoutMs,
  });
  if (error) throw new Error(`brain invoke failed: ${error.message}`);
  const result = data as BrainResult;
  // Only a real correction should touch the cache — updatedDisplayName is present but null on
  // every ordinary reply, and writing null would wipe an already-correct cached name.
  if (result.updatedDisplayName) {
    setCachedDisplayName(userId, result.updatedDisplayName);
  }
  return result;
}
