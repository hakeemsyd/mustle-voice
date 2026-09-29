import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { navigateFromAppAction } from '../navigation/navigationRef';

export interface AppAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

interface AppActionListenerProps {
  userId: string | null;
  onAction?: (action: AppAction) => void;
}

async function consume(id: string) {
  const { error } = await supabase.from('app_action').update({ consumed_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[app-action] failed to mark consumed:', error.message);
}

function handle(action: AppAction, onAction?: (action: AppAction) => void) {
  if (action.type === 'navigate') {
    const screen = action.payload?.screen;
    if (typeof screen === 'string') navigateFromAppAction(screen, action.payload?.params as Record<string, unknown>);
    return;
  }
  onAction?.(action);
}

const COLD_START_DEFER_MS = 4000;
const BACKLOG_MAX_AGE_MS = 2 * 60_000;
const BACKLOG_SWEEP_MS = 10_000;

export function AppActionListener({ userId, onAction }: AppActionListenerProps) {
  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;
    const seen = new Set<string>();

    const take = (row: AppAction, createdAt?: string) => {
      if (stopped || seen.has(row.id)) return;
      seen.add(row.id);
      const age = createdAt ? Date.now() - new Date(createdAt).getTime() : 0;
      if (age <= BACKLOG_MAX_AGE_MS) handle(row, onAction);
      else console.warn(`[app-action] skipped a stale ${row.type} from ${Math.round(age / 1000)}s ago`);
      consume(row.id);
    };

    const drainBacklog = () =>
      supabase
        .from('app_action')
        .select('id,type,payload,created_at')
        .eq('user_id', userId)
        .is('consumed_at', null)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) return console.error('[app-action] backlog fetch failed:', error.message);
          for (const row of data ?? []) take(row as AppAction, (row as { created_at: string }).created_at);
        });

    const timer = setTimeout(() => {
      channel = supabase
        .channel(`app_action:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'app_action', filter: `user_id=eq.${userId}` },
          ({ new: row }) => take(row as AppAction, (row as { created_at?: string }).created_at),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void drainBacklog();
        });
    }, COLD_START_DEFER_MS);

    const sweep = setInterval(() => void drainBacklog(), BACKLOG_SWEEP_MS);

    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(sweep);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, onAction]);

  return null;
}
