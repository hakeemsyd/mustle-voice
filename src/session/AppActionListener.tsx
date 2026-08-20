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

export function AppActionListener({ userId, onAction }: AppActionListenerProps) {
  useEffect(() => {
    if (!userId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      supabase
        .from('app_action')
        .select('id,type,payload')
        .eq('user_id', userId)
        .is('consumed_at', null)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) return console.error('[app-action] backlog fetch failed:', error.message);
          for (const row of data ?? []) {
            handle(row as AppAction, onAction);
            consume(row.id);
          }
        });

      channel = supabase
        .channel(`app_action:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'app_action', filter: `user_id=eq.${userId}` },
          ({ new: row }) => {
            handle(row as AppAction, onAction);
            consume((row as AppAction).id);
          },
        )
        .subscribe();
    }, COLD_START_DEFER_MS);

    return () => {
      clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, onAction]);

  return null;
}
