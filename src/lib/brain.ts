import { supabase } from './supabase';

export type BrainModality = 'voice' | 'text' | 'image' | 'file' | 'live_photo';

export interface PlanBreakdownCard {
  type: 'plan_breakdown';
  split: string;
  days_per_week: number;
  days: {
    plan_session_id: string;
    day_order: number;
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
  macros: { label: string; target: number; unit: string }[];
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

export type ChatCard =
  | PlanBreakdownCard
  | DailyWorkoutCard
  | NutritionSummaryCard
  | ProgressReportCard
  | ReadinessCard
  | TopLiftsCard;

export interface BrainResult {
  reply: string;
  toolCalls: string[];
  card?: ChatCard | null;
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
): Promise<BrainResult> {
  // The device's own current timezone, sent every call — profile.timezone is only written once
  // at onboarding and never refreshed, which silently drifted after travel/DST and misclassified
  // which local day a meal or workout fell on (confirmed live). The backend prefers this over the
  // stored value and opportunistically refreshes it too.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { data, error } = await supabase.functions.invoke('brain', {
    body: { userId, message, modality, hidden, liveSessionState, timezone },
    timeout: timeoutMs,
  });
  if (error) throw new Error(`brain invoke failed: ${error.message}`);
  return data as BrainResult;
}
