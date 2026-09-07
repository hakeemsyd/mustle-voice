import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callBrain, COACH_UNREACHABLE_MESSAGE, type ChatCard } from '../lib/brain';
import { uploadChatFile, uploadChatImage } from '../lib/chatAttachments';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: ChatCard | null;
  imageUrl?: string;
  /** ISO timestamp — real for a loaded/persisted row, synthesized (Date.now()) for a local
   *  optimistic entry. Sorts correctly either way (ISO strings compare lexicographically in
   *  chronological order); only needed so loadMessageContext can merge an older window into the
   *  transcript in the right place instead of just appending it at the end. */
  at: string;
}

export function useHomeChat(userId: string | null) {
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [coachTyping, setCoachTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      // Descending + limit, then re-ascend for display — was ascending+limit(50), which fetched
      // the OLDEST 50 messages ever (a real, unrelated correctness bug found while touching this
      // file for History's tap-to-jump: a long-running account's Home chat only ever showed its
      // very first exchanges, never anything recent).
      const { data, error } = await supabase
        .from('message')
        .select('id,role,content,card,attachment_url,at')
        .eq('user_id', userId)
        .eq('hidden', false)
        .order('at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        console.error('[useHomeChat] failed to load history:', error.message);
      } else {
        setTranscript(
          (data ?? [])
            .slice()
            .reverse()
            // Contentless rows are now dropped before they're ever appended (see useVoiceSession's
            // onMessage), but rows already persisted from before that fix still need hiding —
            // an image-only row is the one legitimate case of empty text.
            .filter((row) => row.attachment_url || /[\p{L}\p{N}]/u.test(row.content ?? ''))
            .map((row) => ({
              id: row.id,
              role: row.role === 'assistant' ? 'assistant' : 'user',
              text: row.content,
              card: row.card,
              imageUrl: row.attachment_url ?? undefined,
              at: row.at,
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
    // The SDK emits the occasional contentless turn — silence it heard as speech, an interim
    // transcript that resolved to nothing. Those were landing in the feed as empty/"…"-only
    // rows, which read as messages the user never sent.
    if (!/[\p{L}\p{N}]/u.test(text)) return;
    setTranscript((prev) => [...prev, { id: `local-${Date.now()}-${role}`, role, text, at: new Date().toISOString() }]);
  }, []);

  const latestRequestRef = useRef(0);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId) return;

      const requestId = ++latestRequestRef.current;
      setTranscript((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: 'user', text: trimmed, at: new Date().toISOString() },
      ]);
      setCoachTyping(true);

      try {
        const result = await callBrain(userId, trimmed);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-r`, role: 'assistant', text: result.reply, card: result.card, at: new Date().toISOString() },
        ]);
      } catch (err) {
        console.error('[useHomeChat] brain call failed:', err);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-e`, role: 'assistant', text: COACH_UNREACHABLE_MESSAGE, at: new Date().toISOString() },
        ]);
      } finally {
        if (latestRequestRef.current === requestId) setCoachTyping(false);
      }
    },
    [userId],
  );

  // Loads a window of messages around a specific one (a History-entry tap, e.g.) and merges it
  // into the current transcript, deduped by id — used when that message isn't already in the
  // currently-loaded window (only the most recent 50 are loaded up front). Returns true once the
  // target message is confirmed present so the caller can scroll to it.
  const loadMessageContext = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!userId) return false;

      const { data: target } = await supabase
        .from('message')
        .select('at')
        .eq('id', messageId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!target) return false;

      const { data, error } = await supabase
        .from('message')
        .select('id,role,content,card,attachment_url,at')
        .eq('user_id', userId)
        .eq('hidden', false)
        .lte('at', target.at)
        .order('at', { ascending: false })
        .limit(50);
      if (error || !data) {
        console.error('[useHomeChat] failed to load message context:', error?.message);
        return false;
      }

      setTranscript((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...prev];
        for (const row of data) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          merged.push({
            id: row.id,
            role: row.role === 'assistant' ? 'assistant' : 'user',
            text: row.content,
            card: row.card,
            imageUrl: row.attachment_url ?? undefined,
            at: row.at,
          });
        }
        merged.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
        return merged;
      });
      return true;
    },
    [userId],
  );

  const attachImage = useCallback(
    async (uri: string) => {
      if (!userId) return;
      const requestId = ++latestRequestRef.current;
      setTranscript((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: 'user', text: '', imageUrl: uri, at: new Date().toISOString() },
      ]);
      setCoachTyping(true);

      try {
        const signedUrl = await uploadChatImage(userId, uri);
        const result = await callBrain(userId, '', 'image', false, undefined, undefined, signedUrl);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-r`, role: 'assistant', text: result.reply, card: result.card, at: new Date().toISOString() },
        ]);
      } catch (err) {
        console.error('[useHomeChat] attachImage failed:', err);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-e`, role: 'assistant', text: COACH_UNREACHABLE_MESSAGE, at: new Date().toISOString() },
        ]);
      } finally {
        if (latestRequestRef.current === requestId) setCoachTyping(false);
      }
    },
    [userId],
  );

  const attachFile = useCallback(
    async (uri: string, name: string) => {
      if (!userId) return;
      const requestId = ++latestRequestRef.current;
      setTranscript((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: 'user', text: `Attached: ${name}`, at: new Date().toISOString() },
      ]);
      setCoachTyping(true);

      try {
        await uploadChatFile(userId, uri, name);
        const result = await callBrain(userId, `Attached a file: ${name}`, 'file');
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-r`, role: 'assistant', text: result.reply, card: result.card, at: new Date().toISOString() },
        ]);
      } catch (err) {
        console.error('[useHomeChat] attachFile failed:', err);
        if (latestRequestRef.current !== requestId) return;
        setTranscript((prev) => [
          ...prev,
          { id: `local-${Date.now()}-e`, role: 'assistant', text: COACH_UNREACHABLE_MESSAGE, at: new Date().toISOString() },
        ]);
      } finally {
        if (latestRequestRef.current === requestId) setCoachTyping(false);
      }
    },
    [userId],
  );

  return { transcript, coachTyping, loaded, sendMessage, appendLocal, loadMessageContext, attachImage, attachFile };
}
