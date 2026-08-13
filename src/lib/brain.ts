import { supabase } from './supabase';

export type BrainModality = 'voice' | 'text' | 'image' | 'file' | 'live_photo';

export interface BrainResult {
  reply: string;
  toolCalls: string[];
}

export async function callBrain(
  userId: string,
  message: string,
  modality: BrainModality = 'text',
  hidden: boolean = false,
): Promise<BrainResult> {
  const { data, error } = await supabase.functions.invoke('brain', {
    body: { userId, message, modality, hidden },
  });
  if (error) throw new Error(`brain invoke failed: ${error.message}`);
  return data as BrainResult;
}
