import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callBrain, COACH_UNREACHABLE_MESSAGE, type ChatCard } from '../lib/brain';
import { resolveAttachmentUrls, uploadChatFile, uploadChatImage } from '../lib/chatAttachments';
import { stripNonSpeechArtifacts } from '../lib/elevenLabsVoice';
import { enterConversation } from '../lib/conversations';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  card?: ChatCard | null;
  imageUrl?: string;
  /** Upload/analysis state for an attached image. Present only on the local optimistic entry —
   *  a persisted row that came back from the server is, by definition, 'sent'. Without this the
   *  bubble showed a thumbnail the instant it was picked and then looked identical whether the
   *  upload was still running, had finished, or had failed outright: confirmed live, an image
   *  that never reached the coach was indistinguishable from one that had. */
  attachmentStatus?: 'uploading' | 'sent' | 'failed';
  at: string;
}


/** Message rows store a storage PATH for an attachment (older rows, an expired absolute URL).
 *  Neither is renderable as-is, so both load paths resolve them to fresh signed URLs in one
 *  batched call — otherwise the thumbnail is a permanent grey box.
 *
 *  Deliberately applied AFTER the rows are in state, never awaited before them: signing is a
 *  network round trip, and blocking on it held the entire transcript — every line of text
 *  included — behind a call that only the images needed. The text lands immediately and each
 *  thumbnail fills in when its URL arrives. */
const patchResolvedAttachments = async (
  rows: ChatMessage[],
  apply: (patch: Map<string, string>) => void,
) => {
  const refs = rows.map((r) => r.imageUrl).filter((u): u is string => !!u);
  if (refs.length === 0) return;
  const resolved = await resolveAttachmentUrls(refs);
  // Nothing actually needed re-signing (all local previews), so skip the re-render entirely.
  if (![...resolved].some(([ref, url]) => ref !== url)) return;
  apply(resolved);
};

/** Rewrites imageUrl in place for whichever rows were re-signed, leaving the rest untouched. */
const applyAttachmentPatch = (rows: ChatMessage[], patch: Map<string, string>): ChatMessage[] =>
  rows.map((r) => {
    if (!r.imageUrl) return r;
    const next = patch.get(r.imageUrl);
    return next && next !== r.imageUrl ? { ...r, imageUrl: next } : r;
  });

const toChatMessage = (row: any): ChatMessage => ({
  id: row.id,
  role: (row.role === 'assistant' ? 'assistant' : 'user') as ChatMessage['role'],
  text: row.content,
  card: row.card,
  imageUrl: row.attachment_url ?? undefined,
  at: row.at,
});

export const useHomeChat = (userId: string | null, requestedConversationId: string | null = null) => {
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [coachTyping, setCoachTyping] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoaded(false);

    (async () => {
      const id = await enterConversation(requestedConversationId);
      if (cancelled) return;
      setConversationId(id);
      if (!id) {
        setTranscript([]);
        setLoaded(true);
        return;
      }

      const { data, error } = await supabase
        .from('message')
        .select('id,role,content,card,attachment_url,at')
        .eq('user_id', userId)
        .eq('conversation_id', id)
        .eq('hidden', false)
        .order('at', { ascending: false })
        .limit(300);
      if (cancelled) return;
      if (error) {
        console.error('[useHomeChat] failed to load conversation:', error.message);
      } else {
        const rows = (data ?? [])
          .slice()
          .reverse()
          // Contentless rows are now dropped before they're ever appended (see useVoiceSession's
          // onMessage), but rows already persisted from before that fix still need hiding —
          // an image-only row is the one legitimate case of empty text.
          .filter((row) => row.attachment_url || /[\p{L}\p{N}]/u.test(row.content ?? ''))
          .map(toChatMessage);
        setTranscript(rows);
        void patchResolvedAttachments(rows, (patch) => {
          if (cancelled) return;
          setTranscript((prev) => applyAttachmentPatch(prev, patch));
        });
      }
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, requestedConversationId]);

  const keepConversationOpen = useCallback(async () => {
    if (requestedConversationId) await enterConversation(requestedConversationId);
  }, [requestedConversationId]);

  const settleConversation = useCallback(async () => {
    if (requestedConversationId || conversationId) return;
    const id = await enterConversation(null);
    if (id) setConversationId(id);
  }, [requestedConversationId, conversationId]);

  // Voice turns come from the ElevenLabs SDK's own transcript (see useVoiceSession),
  // not from the brain — nothing to persist here, just reflect them in the same feed
  // so a conversation reads as one thread whether it was typed or spoken.
  const appendLocal = useCallback((role: 'user' | 'assistant', text: string) => {
    // The SDK emits the occasional contentless turn — silence it heard as speech, an interim
    // transcript that resolved to nothing, or (confirmed live) a bracketed non-speech
    // annotation like "[Silence]" instead of returning empty. stripNonSpeechArtifacts strips
    // that annotation first so a genuinely silent turn still drops here instead of landing in
    // the feed as a message nobody sent.
    const cleaned = stripNonSpeechArtifacts(text);
    if (!cleaned) return;
    setTranscript((prev) => [...prev, { id: `local-${Date.now()}-${role}`, role, text: cleaned, at: new Date().toISOString() }]);
  }, []);

  const latestRequestRef = useRef(0);
  const inFlightTextsRef = useRef(new Set<string>());

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !userId) return;
      const inFlightKey = trimmed.toLowerCase();
      if (inFlightTextsRef.current.has(inFlightKey)) return;
      inFlightTextsRef.current.add(inFlightKey);

      const requestId = ++latestRequestRef.current;
      setTranscript((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, role: 'user', text: trimmed, at: new Date().toISOString() },
      ]);
      setCoachTyping(true);

      try {
        await keepConversationOpen();
        const result = await callBrain({ userId, message: trimmed });
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
        inFlightTextsRef.current.delete(inFlightKey);
        if (latestRequestRef.current === requestId) setCoachTyping(false);
        void settleConversation();
      }
    },
    [userId, keepConversationOpen, settleConversation],
  );

  const attachImage = useCallback(
    async (uri: string) => {
      if (!userId) return;
      const requestId = ++latestRequestRef.current;
      // The bubble is stamped with a stable id so its status can be updated in place as the
      // upload progresses, rather than appending a second bubble or leaving the first frozen.
      const bubbleId = `local-${Date.now()}`;
      const setStatus = (attachmentStatus: ChatMessage['attachmentStatus']) =>
        setTranscript((prev) =>
          prev.map((m) => (m.id === bubbleId ? { ...m, attachmentStatus } : m)),
        );

      setTranscript((prev) => [
        ...prev,
        {
          id: bubbleId,
          role: 'user',
          text: '',
          imageUrl: uri,
          attachmentStatus: 'uploading',
          at: new Date().toISOString(),
        },
      ]);
      setCoachTyping(true);

      try {
        const { path, signedUrl } = await uploadChatImage(userId, uri);
        if (latestRequestRef.current !== requestId) return;
        await keepConversationOpen();
        const result = await callBrain({
          userId,
          message: '',
          modality: 'image',
          attachmentUrl: signedUrl,
          attachmentPath: path,
        });
        if (latestRequestRef.current !== requestId) return;
        setStatus('sent');
        setTranscript((prev) => [
          ...prev,
          { id: `${bubbleId}-r`, role: 'assistant', text: result.reply, card: result.card, at: new Date().toISOString() },
        ]);
      } catch (err) {
        console.error('[useHomeChat] attachImage failed:', err);
        if (latestRequestRef.current !== requestId) return;
        // Marked on the image itself, not only as a coach message — the failure belongs to the
        // thing that failed, so the user can see WHICH photo didn't make it.
        setStatus('failed');
        setTranscript((prev) => [
          ...prev,
          { id: `${bubbleId}-e`, role: 'assistant', text: COACH_UNREACHABLE_MESSAGE, at: new Date().toISOString() },
        ]);
      } finally {
        if (latestRequestRef.current === requestId) setCoachTyping(false);
        void settleConversation();
      }
    },
    [userId, keepConversationOpen, settleConversation],
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
        await keepConversationOpen();
        const result = await callBrain({ userId, message: `Attached a file: ${name}`, modality: 'file' });
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
        void settleConversation();
      }
    },
    [userId, keepConversationOpen, settleConversation],
  );

  return {
    transcript,
    coachTyping,
    loaded,
    conversationId,
    sendMessage,
    appendLocal,
    keepConversationOpen,
    attachImage,
    attachFile,
  };
};
