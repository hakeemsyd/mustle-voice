import { useConversation } from '@elevenlabs/react-native';
import type { OrbState } from '../components/VoiceOrb';

// Wraps the real ElevenLabs conversation hook (not a decorative animation) —
// must be called inside a <ConversationProvider> (see App.tsx).
export function useVoiceSession() {
  const { startSession, endSession, status, isSpeaking, isListening } = useConversation({
    onError: (message) => console.error('[voice] error:', message),
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

  const toggle = () => {
    if (isActive) {
      endSession();
    } else {
      startSession();
    }
  };

  return { orbState, isActive, toggle, status };
}
