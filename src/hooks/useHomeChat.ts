import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callBrain, COACH_UNREACHABLE_MESSAGE, type PlanBreakdownCard } from '../lib/brain';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: PlanBreakdownCard | null;
}

export function useHomeChat(userId: string | null) {
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [coachTyping, setCoachTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('message')
        .select('id,role,content,card')
        .eq('user_id', userId)
        .eq('hidden', false)
        .order('at', { ascending: true })
        .limit(50);
      if (cancelled) return;
      if (error) {
        console.error('[useHomeChat] failed to load history:', error.message);
      } else {
        setTranscript(
          (data ?? []).map((row) => ({
            id: row.id,
            role: row.role === 'assistant' ? 'assistant' : 'user',
            text: row.content,
            card: row.card,
          })),
        );
      }
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Voice turns come from the ElevenLabs SDK's own transcript (see useVoiceSession),
  // not from the brain — nothing to persist here, just reflect them in the same feed
  // so a conversation reads as one thread whether it was typed or spoken.
  const appendLocal = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript((prev) => [...prev, { id: `local-${Date.now()}-${role}`, role, text }]);
  }, []);

  const latestRequestRef = useRef(0);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId) return;

      const requestId = ++latestRequestRef.current;
      setTranscript((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text: trimmed }]);
      setCoachTyping(true);

      try {
        const result = await callBrain(userId, trimmed);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-r`, role: 'assistant', text: result.reply, card: result.card },
        ]);
      } catch (err) {
        console.error('[useHomeChat] brain call failed:', err);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-e`, role: 'assistant', text: COACH_UNREACHABLE_MESSAGE },
        ]);
      } finally {
        if (latestRequestRef.current === requestId) setCoachTyping(false);
      }
    },
    [userId],
  );

  return { transcript, coachTyping, loaded, sendMessage, appendLocal };
}
