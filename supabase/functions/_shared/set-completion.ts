import { describesPlannedSet, looksLikeFinishedSetReport } from './set-report.ts';

export function hasSetCompletionSignal(text: string): boolean {
  return looksLikeFinishedSetReport(text ?? '');
}

export const COMPLETION_LOOKBACK_MS = 3 * 60 * 1000;
export const COMPLETION_LOOKBACK_TURNS = 5;

export async function userClaimedSetFinished(
  supabase: any,
  userId: string,
  currentUserText: string | null,
): Promise<boolean> {
  if (currentUserText && hasSetCompletionSignal(currentUserText)) return true;
  if (currentUserText && describesPlannedSet(currentUserText)) return false;

  const { data } = await supabase
    .from('message')
    .select('content')
    .eq('user_id', userId)
    .eq('role', 'user')
    .eq('hidden', false)
    .gte('at', new Date(Date.now() - COMPLETION_LOOKBACK_MS).toISOString())
    .order('at', { ascending: false })
    .limit(COMPLETION_LOOKBACK_TURNS);

  return (data ?? []).some((m: any) => hasSetCompletionSignal(String(m.content ?? '')));
}
