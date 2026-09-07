import { useConversation } from '@elevenlabs/react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { subscribeToAudioInterruptions } from '../../modules/mustle-audio-session';
import { supabase } from '../lib/supabase';
import { setCachedDisplayName } from '../lib/profileStore';
import type { OrbState } from '../components/VoiceOrb';

export interface SpokenMessage {
  role: 'user' | 'agent';
  text: string;
}

export interface VoiceSessionConfig {
  /** Tags the ElevenLabs conversation with our Supabase user — without this,
   *  a session has no identity on ElevenLabs' side, so their API can't
   *  attribute it to anyone. */
  userId?: string | null;
  /** Fills `{{user_name}}` etc. in the agent's own dashboard-configured
   *  prompt/first-message template. Unlike `overrides`, this isn't gated by
   *  the agent's per-field "allow overrides" security setting — but it only
   *  actually shows up if the dashboard template references the variable. */
  dynamicVariables?: Record<string, string>;
}

const MAX_AUTO_RECONNECTS = 1;

// A handful of short, deliberate stop phrases — matched as a WHOLE clause, never as a
// substring anywhere in a longer sentence. "Done" is deliberately excluded: mid-workout it
// means "done with this set," not "end the voice session" — see parseSetReport.
const STOP_PHRASES = new Set([
  'stop',
  'stop talking',
  'bye',
  'goodbye',
  'bye bye',
  'hang up',
  'quiet',
  'be quiet',
  'close',
  "that's all",
  "that'll be all",
]);

// Stripped one at a time off the front of the final clause — "okay so that's all" needs both
// "okay" and "so" gone before it reduces to a listed phrase. Kept separate from STOP_PHRASES
// itself: these are never a stop command on their own, only noise in front of one.
const LEADING_FILLER_WORDS = new Set(['ok', 'okay', 'alright', 'so', 'well', 'please']);

function isStopCommand(text: string): boolean {
  // Confirmed live: "Okay, so that's all. Bye" never matched — the comma after "Okay" blocked
  // the old single prefix-regex, and the fixed sentence-final-punctuation strip only looked at
  // the very end of the whole utterance, never noticing the "Bye" was its own clause. Splitting
  // into clauses and checking only the LAST one is also more correct on intent: if the user
  // talks past an earlier "bye" ("bye, actually wait, one more thing"), that shouldn't end the
  // call either.
  const clauses = text
    .toLowerCase()
    .split(/[.!?]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const last = clauses[clauses.length - 1];
  if (!last) return false;

  let words = last.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && LEADING_FILLER_WORDS.has(words[0])) {
    words = words.slice(1);
  }
  return STOP_PHRASES.has(words.join(' '));
}

// If the user hasn't said anything in this long, the conversation is almost certainly over —
// close it rather than let the agent keep listening/checking in indefinitely (confirmed live:
// it kept making filler noises and checking in for minutes of silence). Deliberately reset only
// by the USER's own speech, never the agent's — an agent that itself talks unprompted every
// 10-20s must not be able to keep resetting its own timeout.
const SILENCE_TIMEOUT_MS = 60_000;
// How long a blurred screen's pending close waits for the next screen to claim the conversation
// — long enough to cover a navigation transition, short enough that genuinely leaving voice
// behind still closes the mic promptly.
const HANDOFF_GRACE_MS = 600;
const SILENCE_CHECK_INTERVAL_MS = 5_000;

// Wraps the real ElevenLabs conversation hook (not a decorative animation) —
// must be called inside a <ConversationProvider> (see App.tsx).
export function useVoiceSession(
  onSpokenMessage?: (message: SpokenMessage) => void,
  config?: VoiceSessionConfig,
) {
  const [reconnecting, setReconnecting] = useState(false);
  const [voiceDropped, setVoiceDropped] = useState(false);
  const [idleClosed, setIdleClosed] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const intentionalEndRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;
  const lastUserActivityRef = useRef(Date.now());
  const endedByBackgroundRef = useRef(false);

  const {
    startSession,
    endSession,
    status,
    isSpeaking,
    isListening,
    sendContextualUpdate,
    sendUserMessage,
    getInputVolume,
    isMuted,
    setMuted,
  } = useConversation({
    onError: (message) => console.error('[voice] error:', message),
    onMessage: ({ message, role }) => {
      // The SDK emits the occasional contentless turn — room noise heard as speech, or an
      // interim transcript that resolved to nothing. Dropped at the source for two reasons:
      // they were landing in the visible thread as messages nobody sent, and a contentless
      // *user* turn was resetting the silence timeout below — so a conversation nobody was
      // actually taking part in never timed out, and the agent went on filling the silence
      // ("Still here. What do you need?") indefinitely.
      if (!/[\p{L}\p{N}]/u.test(message)) return;
      if (role === 'user') {
        lastUserActivityRef.current = Date.now();
        if (isStopCommand(message)) {
          intentionalEndRef.current = true;
          Promise.resolve(endSession())
            .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
            .catch((err) => console.error('[voice] failed to end session on stop command:', err));
          return;
        }
      }
      onSpokenMessage?.({ role, text: message });
    },
    // The LiveKit transport can drop on its own (ping timeout, network blip) mid-conversation —
    // confirmed live: a dropped connection silently ate a spoken set report with zero feedback,
    // leaving the orb looking normal while nothing was actually connected. `reason` distinguishes
    // that from the user tapping to end (`"user"`), which needs no recovery at all.
    onDisconnect: (details) => {
      // Voice calls the brain directly through ElevenLabs' realtime protocol, bypassing
      // src/lib/brain.ts's callBrain entirely — so a mid-call name correction (update_profile)
      // never reaches profileStore's cache the way a text turn's response does. This blunt
      // backstop refetches once the call ends, catching it within one call-end instead of
      // leaving it stale until something unrelated happens to refresh the cache.
      const userId = configRef.current?.userId;
      if (userId) {
        void supabase
          .from('profile')
          .select('display_name')
          .eq('user_id', userId)
          .maybeSingle()
          .then(({ data }) => {
            if (data) setCachedDisplayName(userId, data.display_name ?? null);
          });
      }

      if (intentionalEndRef.current) {
        intentionalEndRef.current = false;
        return;
      }
      if (details.reason === 'user') return;

      if (reconnectAttemptsRef.current >= MAX_AUTO_RECONNECTS) {
        setVoiceDropped(true);
        return;
      }
      reconnectAttemptsRef.current += 1;
      setReconnecting(true);
      setReconnectTrigger((n) => n + 1);
    },
  });

  // Every end path above disables recording on the iOS audio session, so it has to be re-enabled
  // before each start — not just once at app launch. Missing this was why a *second* voice
  // session in the same app run connected with a mic that couldn't capture: the agent talked,
  // heard nothing back, and kept re-asking the same question. Awaited, not fired alongside, so
  // the session never opens against a still-muted route.
  const startSessionWithRecordingEnabled = async (options: {
    userId?: string;
    dynamicVariables?: Record<string, string>;
  }) => {
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch (err) {
      console.warn('[voice] failed to enable recording audio mode:', err);
    }
    return startSession(options);
  };

  useEffect(() => {
    if (reconnectTrigger === 0) return;
    Promise.resolve(
      startSessionWithRecordingEnabled({
        userId: configRef.current?.userId ?? undefined,
        dynamicVariables: configRef.current?.dynamicVariables,
      }),
    )
      .catch((err) => {
        console.error('[voice] auto-reconnect failed:', err);
        setVoiceDropped(true);
      })
      .finally(() => setReconnecting(false));
    // Deliberately keyed only on the trigger counter — startSession/config are read via refs so
    // a reconnect always uses the latest values without re-running this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconnectTrigger]);

  useEffect(() => {
    if (status === 'connected') {
      setVoiceDropped(false);
      setIdleClosed(false);
      // A successful (re)connection resolves whatever drop preceded it — without this, a second,
      // unrelated drop later in the same session was treated as exceeding the retry cap and gave
      // up permanently, since the counter only ever incremented across the screen's lifetime.
      reconnectAttemptsRef.current = 0;
      lastUserActivityRef.current = Date.now();
    }
  }, [status]);

  // Auto-close after a stretch of user silence, regardless of how much the agent itself has
  // been talking — see the SILENCE_TIMEOUT_MS comment above for why only user speech resets it.
  useEffect(() => {
    if (status !== 'connected') return;
    const id = setInterval(() => {
      if (Date.now() - lastUserActivityRef.current < SILENCE_TIMEOUT_MS) return;
      intentionalEndRef.current = true;
      setIdleClosed(true);
      Promise.resolve(endSession())
        .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
        .catch((err) => console.error('[voice] failed to end session on silence timeout:', err));
    }, SILENCE_CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, endSession]);

  // A call answered, or the app backgrounded for any other reason, must not leave the mic/voice
  // session silently running — confirmed live: an incoming call didn't pause or stop the coach.
  // `background` (not `inactive`, which also fires for transient UI like Control Center) is the
  // only state that reliably means the user actually left the app.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') {
        if (status !== 'connected' && status !== 'connecting') return;
        // Remembered so returning to the app can pick the call back up. Backgrounding still has
        // to end it — iOS won't keep the mic open for us — but a user who locks their phone or
        // steps out to change music mid-workout should not have to find and tap the mic again.
        endedByBackgroundRef.current = true;
        intentionalEndRef.current = true;
        Promise.resolve(endSession())
          .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
          .catch((err) => console.error('[voice] failed to end session on backgrounding:', err));
        return;
      }
      if (next === 'active' && endedByBackgroundRef.current) {
        endedByBackgroundRef.current = false;
        connectRef.current();
      }
    });
    return () => sub.remove();
  }, [status, endSession]);

  // Backgrounding alone doesn't cover every interruption — a call banner answered without
  // switching apps, Siri, or an alarm can seize the audio session while Mustle stays foregrounded,
  // and none of those fire an AppState change. This listens for the actual iOS audio-session
  // interruption directly (see modules/mustle-audio-session) so those cases end the call too,
  // instead of leaving the mic silently open through someone else's phone call.
  useEffect(() => {
    return subscribeToAudioInterruptions(() => {
      if (status !== 'connected' && status !== 'connecting') return;
      intentionalEndRef.current = true;
      Promise.resolve(endSession())
        .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
        .catch((err) => console.error('[voice] failed to end session on audio interruption:', err));
    });
  }, [status, endSession]);

  // Real ASR interim transcripts aren't available on this SDK's Conversational-AI/WebRTC path
  // (confirmed: the wire-level tentative_user_transcript event has no handler in the installed
  // client). getInputVolume() is the honest substitute — a genuine "I can hear you, and how
  // loud" signal to drive a live listening pulse, not a fabricated transcript.
  const [inputLevel, setInputLevel] = useState(0);
  useEffect(() => {
    if (status !== 'connected' || !isListening) {
      setInputLevel(0);
      return;
    }
    const id = setInterval(() => setInputLevel(getInputVolume()), 100);
    return () => clearInterval(id);
  }, [status, isListening, getInputVolume]);

  const isActive = status === 'connected' || status === 'connecting' || reconnecting;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  const orbState: OrbState =
    reconnecting || status === 'connecting'
      ? 'processing'
      : status === 'connected'
        ? isSpeaking
          ? 'speaking'
          : isListening
            ? 'listening'
            : 'breathing'
        : 'breathing';

  // Both SDK calls return promises. Left unhandled, a failed connection surfaces as an
  // unhandled rejection — a full red-screen crash — rather than the session simply not
  // starting, so every path is caught here.
  const connectNow = () => {
    if (isActive) return;
    reconnectAttemptsRef.current = 0;
    setVoiceDropped(false);
    setIdleClosed(false);
    Promise.resolve(
      startSessionWithRecordingEnabled({
        userId: config?.userId ?? undefined,
        dynamicVariables: config?.dynamicVariables,
      }),
    ).catch((err) => console.error('[voice] failed to start session:', err));
  };

  const disconnectNow = () => {
    if (!isActive) return;
    intentionalEndRef.current = true;
    Promise.resolve(endSession())
      .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
      .catch((err) => console.error('[voice] failed to end session:', err));
  };

  // Screens put these straight into effect dependency arrays to open/close the mic on focus, so
  // they have to keep a stable identity — a fresh closure on every status change would re-run
  // those effects and thrash the connection. The ref indirection keeps the identity fixed while
  // the behaviour stays current.
  const connectRef = useRef(connectNow);
  const disconnectRef = useRef(disconnectNow);
  connectRef.current = connectNow;
  disconnectRef.current = disconnectNow;

  // Screens hand the conversation to one another — Preview into Active Session, Global Chat into
  // Preview — and navigation fires the outgoing screen's blur before the incoming screen's
  // focus. Closing on blur immediately would therefore tear down a call the next screen is
  // about to keep, then have it dial straight back up. `release` defers the close just long
  // enough for the arriving screen to claim it, and any `connect` cancels a pending one.
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelRelease = () => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
  };

  useEffect(() => cancelRelease, []);

  const connect = useCallback(() => {
    cancelRelease();
    connectRef.current();
  }, []);

  const disconnect = useCallback(() => {
    cancelRelease();
    disconnectRef.current();
  }, []);

  const release = useCallback(() => {
    cancelRelease();
    releaseTimerRef.current = setTimeout(() => {
      releaseTimerRef.current = null;
      disconnectRef.current();
    }, HANDOFF_GRACE_MS);
  }, []);

  const toggle = useCallback(() => {
    cancelRelease();
    if (isActiveRef.current) disconnectRef.current();
    else connectRef.current();
  }, []);

  // Exposed so a caller can tell the agent about something the app just did (e.g. a set was
  // logged) without speaking it aloud or waiting for a reply — see ActiveSessionScreen for why
  // this matters: ElevenLabs' agent has no visibility into app state on its own.
  // Real SDK mute (`setMicMuted` under the hood), not a decorative flag — the mic stops being
  // sent while the conversation itself stays connected, so the agent isn't torn down and
  // restarted just to stop it hearing the room for a moment.
  //
  // Only meaningful once a conversation exists: setMuted throws
  // "No active conversation. Call startSession() first." outright when there isn't one, which
  // is an uncaught red-screen crash, not a caught rejection like the start/end paths above.
  const toggleMute = () => {
    if (status !== 'connected') return;
    try {
      setMuted(!isMuted);
    } catch (err) {
      console.error('[voice] failed to toggle mute:', err);
    }
  };

  return {
    orbState,
    isActive,
    toggle,
    connect,
    disconnect,
    release,
    status,
    sendContextualUpdate,
    sendUserMessage,
    reconnecting,
    voiceDropped,
    idleClosed,
    inputLevel,
    isMuted,
    toggleMute,
  };
}
