import { useConversation } from '@elevenlabs/react-native';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { subscribeToAudioInterruptions } from '../../modules/mustle-audio-session';
import type { OrbState } from '../components/VoiceOrb';

interface SpokenMessage {
  role: 'user' | 'agent';
  text: string;
}

interface VoiceSessionConfig {
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

// A handful of short, deliberate stop phrases — matched as the WHOLE utterance (after
// stripping trailing punctuation and a polite prefix like "okay"/"please"), never as a
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

function isStopCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?,]+$/g, '');
  if (STOP_PHRASES.has(normalized)) return true;
  const stripped = normalized.replace(/^(ok|okay|alright|please)\s+/, '');
  return STOP_PHRASES.has(stripped);
}

// If the user hasn't said anything in this long, the conversation is almost certainly over —
// close it rather than let the agent keep listening/checking in indefinitely (confirmed live:
// it kept making filler noises and checking in for minutes of silence). Deliberately reset only
// by the USER's own speech, never the agent's — an agent that itself talks unprompted every
// 10-20s must not be able to keep resetting its own timeout.
const SILENCE_TIMEOUT_MS = 60_000;
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

  const { startSession, endSession, status, isSpeaking, isListening, sendContextualUpdate, sendUserMessage } = useConversation({
    onError: (message) => console.error('[voice] error:', message),
    onMessage: ({ message, role }) => {
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

  useEffect(() => {
    if (reconnectTrigger === 0) return;
    Promise.resolve(
      startSession({
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
      if (next !== 'background') return;
      if (status !== 'connected' && status !== 'connecting') return;
      intentionalEndRef.current = true;
      Promise.resolve(endSession())
        .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
        .catch((err) => console.error('[voice] failed to end session on backgrounding:', err));
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

  const isActive = status === 'connected' || status === 'connecting' || reconnecting;

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
  const toggle = () => {
    if (isActive) {
      intentionalEndRef.current = true;
      Promise.resolve(endSession())
        .then(() => setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }))
        .catch((err) => console.error('[voice] failed to end session:', err));
      return;
    }
    reconnectAttemptsRef.current = 0;
    setVoiceDropped(false);
    setIdleClosed(false);
    Promise.resolve(
      startSession({
        userId: config?.userId ?? undefined,
        dynamicVariables: config?.dynamicVariables,
      }),
    ).catch((err) => console.error('[voice] failed to start session:', err));
  };

  // Exposed so a caller can tell the agent about something the app just did (e.g. a set was
  // logged) without speaking it aloud or waiting for a reply — see ActiveSessionScreen for why
  // this matters: ElevenLabs' agent has no visibility into app state on its own.
  return {
    orbState,
    isActive,
    toggle,
    status,
    sendContextualUpdate,
    sendUserMessage,
    reconnecting,
    voiceDropped,
    idleClosed,
  };
}
