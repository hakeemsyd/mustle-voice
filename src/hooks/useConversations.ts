import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { refreshConversationTitles, toConversationSummary, type ConversationSummary } from '../lib/conversations';

export const useConversations = (userId: string | null, limit = 200) => {
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  useEffect(() => {
    if (!userId) {
      setConversations([]);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('conversation')
        .select('id, kind, title, tags, started_at, last_message_at')
        .eq('user_id', userId)
        .not('last_message_at', 'is', null)
        .order('last_message_at', { ascending: false })
        .limit(limit);
      if (cancelled) return;
      if (error) {
        console.error('[conversations] failed to load:', error.message);
      } else {
        setConversations((data ?? []).map(toConversationSummary));
      }
      setLoading(false);
      const titled = await refreshConversationTitles();
      if (!cancelled && titled > 0) refetch();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, limit, refetchSignal, refetch]);

  return { loading, conversations, refetch };
};
