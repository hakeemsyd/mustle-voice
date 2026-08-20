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

export interface BrainResult {
  reply: string;
  toolCalls: string[];
  card?: PlanBreakdownCard | null;
}

const BRAIN_TIMEOUT_MS = 25000;

export const COACH_UNREACHABLE_MESSAGE = "Couldn't reach the coach — try again in a moment.";

export async function callBrain(
  userId: string,
  message: string,
  modality: BrainModality = 'text',
  hidden: boolean = false,
  timeoutMs: number = BRAIN_TIMEOUT_MS,
): Promise<BrainResult> {
  const { data, error } = await supabase.functions.invoke('brain', {
    body: { userId, message, modality, hidden },
    timeout: timeoutMs,
  });
  if (error) throw new Error(`brain invoke failed: ${error.message}`);
  return data as BrainResult;
}
