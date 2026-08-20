import { useConversation } from '@elevenlabs/react-native';
import { useEffect, useRef, useState } from 'react';
import { setAudioModeAsync } from 'expo-audio';
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

// Wraps the real ElevenLabs conversation hook (not a decorative animation) —
// must be called inside a <ConversationProvider> (see App.tsx).
export function useVoiceSession(
  onSpokenMessage?: (message: SpokenMessage) => void,
  config?: VoiceSessionConfig,
) {
  const [reconnecting, setReconnecting] = useState(false);
  const [voiceDropped, setVoiceDropped] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const intentionalEndRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;

  const { startSession, endSession, status, isSpeaking, isListening, sendContextualUpdate } = useConversation({
    onError: (message) => console.error('[voice] error:', message),
    onMessage: ({ message, role }) => onSpokenMessage?.({ role, text: message }),
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
    if (status === 'connected') setVoiceDropped(false);
  }, [status]);

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
    reconnecting,
    voiceDropped,
  };
}
