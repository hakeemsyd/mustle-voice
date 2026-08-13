import { useConversation } from '@elevenlabs/react-native';
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

// Wraps the real ElevenLabs conversation hook (not a decorative animation) —
// must be called inside a <ConversationProvider> (see App.tsx).
export function useVoiceSession(
  onSpokenMessage?: (message: SpokenMessage) => void,
  config?: VoiceSessionConfig,
) {
  const { startSession, endSession, status, isSpeaking, isListening, sendContextualUpdate } = useConversation({
    onError: (message) => console.error('[voice] error:', message),
    onMessage: ({ message, role }) => onSpokenMessage?.({ role, text: message }),
  });

  const isActive = status === 'connected' || status === 'connecting';

  const orbState: OrbState =
    status === 'connecting'
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
      Promise.resolve(endSession()).catch((err) =>
        console.error('[voice] failed to end session:', err),
      );
      return;
    }
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
  return { orbState, isActive, toggle, status, sendContextualUpdate };
}
