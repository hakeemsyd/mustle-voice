import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callBrain } from '../lib/brain';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
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
        .select('id,role,content')
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

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId) return;

      setTranscript((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', text: trimmed }]);
      setCoachTyping(true);

      try {
        const result = await callBrain(userId, trimmed);
        setTranscript((prev) => [...prev, { id: `local-${Date.now()}-r`, role: 'assistant', text: result.reply }]);
      } catch (err) {
        console.error('[useHomeChat] brain call failed:', err);
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-e`, role: 'assistant', text: "Couldn't reach the coach — try again in a moment." },
        ]);
      } finally {
        setCoachTyping(false);
      }
    },
    [userId],
  );

  return { transcript, coachTyping, loaded, sendMessage, appendLocal };
}
