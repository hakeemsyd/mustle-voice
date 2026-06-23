import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  ConversationProvider,
  useConversationControls,
  useConversationStatus,
  useConversationMode,
} from '@elevenlabs/react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { VoiceOrb } from './src/components/VoiceOrb';
import { ChatList } from './src/components/ChatList';
import { ACCENT } from './src/constants/theme';
import { AGENT_ID, AGENT_ID_SONNET } from './config';
import type { AppStatus, Message } from './src/types';

type Model = 'haiku' | 'sonnet';

const STATUS_LABEL: Record<AppStatus, string> = {
  idle:         '',
  recording:    'Listening...',
  transcribing: 'Transcribing...',
  thinking:     'Connecting...',
  streaming:    'Responding...',
  speaking:     'Speaking...',
  error:        'Error — tap to retry',
};

// Inner UI — lives inside ConversationProvider so it can use the SDK hooks.
function VoiceUI({ messages, debugMode }: { messages: Message[]; debugMode: boolean }) {
  const { startSession, endSession, getInputVolume } = useConversationControls();
  const { status } = useConversationStatus();          // connecting | connected | disconnected | error
  const { isSpeaking } = useConversationMode();         // true while the agent is talking
  const [busy, setBusy] = useState(false);
  const [model, setModel] = useState<Model>('haiku');   // A/B: which agent to connect to
  const [micLevel, setMicLevel] = useState(0);          // debug: live level of our published mic track

  // Resolve the agent for the selected model. Falls back to the primary (Haiku) agent.
  const activeAgentId = model === 'sonnet' && AGENT_ID_SONNET ? AGENT_ID_SONNET : AGENT_ID;
  // Only offer the toggle once a second (Sonnet) agent is actually configured.
  const canToggleModel = !!AGENT_ID_SONNET && debugMode;

  // Derive the orb state from REAL session events (no timers).
  const appStatus: AppStatus =
    status === 'connecting' ? 'thinking'
    : status === 'error'    ? 'error'
    : status === 'connected' ? (isSpeaking ? 'speaking' : 'recording')
    : 'idle';

  const connected = status === 'connected' || status === 'connecting';

  // Keep a fresh-read ref of the connection for the AppState listener below.
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  // On a real backgrounding, end the session cleanly so the orb never strands and we don't
  // keep billing in the background. (Matches the example's minimal model — no AudioSession
  // hacks; the upgraded stack handles mic lifecycle across sessions itself.)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' && connectedRef.current) {
        try { endSession(); } catch {}
      }
    });
    return () => sub.remove();
  }, [endSession]);

  // Keep the screen awake while a session is live (prevents iOS auto-lock mid-set — the most
  // common gym interruption). Independent of the audio pipeline.
  useEffect(() => {
    if (connected) {
      activateKeepAwakeAsync('mustle-session').catch(() => {});
      return () => { deactivateKeepAwake('mustle-session').catch(() => {}); };
    }
  }, [connected]);

  // DEBUG diagnostic: poll the live level of our published mic track. If this moves when
  // you speak, the mic is capturing; if it stays 0, the mic isn't producing audio at all.
  useEffect(() => {
    if (!connected || !debugMode) return;
    const id = setInterval(() => {
      try { setMicLevel(getInputVolume() || 0); } catch {}
    }, 200);
    return () => clearInterval(id);
  }, [connected, debugMode, getInputVolume]);

  const handlePress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (connected) {
        // Tapping while connected ends the session — also the recovery path if it ever hangs.
        endSession();
      } else {
        if (!activeAgentId) {
          Alert.alert('Setup needed', 'No ElevenLabs agent ID configured (EXPO_PUBLIC_AGENT_ID).');
          return;
        }
        // WebRTC connection = native barge-in + echo cancellation. The SDK owns the full
        // audio/mic lifecycle (matches the official example — no manual AudioSession calls).
        startSession({ agentId: activeAgentId, connectionType: 'webrtc' });
      }
    } catch (e: any) {
      Alert.alert('Voice error', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, connected, startSession, endSession, activeAgentId]);

  const statusLabel = appStatus === 'idle'
    ? (connected ? 'Tap to end' : 'Tap to start')
    : STATUS_LABEL[appStatus];

  if (connected) {
    return (
      <View style={styles.orbScreen}>
        <VoiceOrb status={appStatus} onPress={handlePress} />
        <Text style={styles.orbStatus}>{statusLabel}</Text>
        <Text style={styles.orbHint}>
          {debugMode ? `mic level: ${Math.round(micLevel * 100)}%` : 'Tap the orb to end'}
        </Text>
      </View>
    );
  }

  return (
    <>
      <ChatList
        messages={messages}
        status={appStatus}
        debugMode={debugMode}
        playingId={null}
        onPlay={() => {}}
        onStop={() => {}}
      />
      <View style={styles.bottomBar}>
        {canToggleModel && (
          <View style={styles.modelToggle}>
            {(['haiku', 'sonnet'] as Model[]).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.modelChip, model === m && styles.modelChipActive]}
                onPress={() => setModel(m)}
                activeOpacity={0.8}
              >
                <Text style={[styles.modelChipText, model === m && styles.modelChipTextActive]}>
                  {m === 'haiku' ? 'Haiku' : 'Sonnet'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        <Text style={styles.statusText}>{statusLabel}</Text>
        <TouchableOpacity style={styles.micButton} onPress={handlePress} activeOpacity={0.85}>
          <View style={styles.micDot} />
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [debugMode, setDebugMode] = useState(false);
  const msgCounter = useRef(0);

  // NOTE: we intentionally do NOT call getUserMedia on load. The ElevenLabs SDK requests
  // and owns the microphone when the session starts (matching their official Expo example).
  // Grabbing + releasing the mic on load can leave the iOS audio session in a state where
  // the session's own capture is silent (empty "..." user turns).

  // Transcripts come from the SDK as they're finalized — drive the chat from real events.
  const handleMessage = useCallback(({ message, role }: { message: string; role: string }) => {
    if (!message?.trim()) return;
    const mappedRole: Message['role'] = role === 'user' ? 'user' : 'assistant';
    setMessages(prev => [
      ...prev,
      { id: `m-${msgCounter.current++}`, role: mappedRole, text: message, timestamp: new Date() },
    ]);
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        <TouchableOpacity
          style={styles.header}
          onLongPress={() => setDebugMode(d => !d)}
          delayLongPress={800}
          activeOpacity={1}
        >
          <Text style={styles.appName}>MUSTLE</Text>
          <Text style={styles.subtitle}>VOICE COACH</Text>
        </TouchableOpacity>

        <ConversationProvider
          onMessage={handleMessage}
          onConnect={({ conversationId }: { conversationId: string }) =>
            console.log('[Conv] connected', conversationId)
          }
          onDisconnect={(details: unknown) => console.log('[Conv] disconnected', details)}
          onError={(message: string, context?: unknown) =>
            console.warn('[Conv] error', message, context)
          }
        >
          <VoiceUI messages={messages} debugMode={debugMode} />
        </ConversationProvider>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
  },
  appName:  { fontSize: 20, fontWeight: '800', color: ACCENT, letterSpacing: 8 },
  subtitle: { fontSize: 10, color: '#444', letterSpacing: 4, marginTop: 2 },
  bottomBar: {
    borderTopWidth: 1,
    borderTopColor: '#161616',
    paddingTop: 12,
    paddingBottom: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 10,
  },
  statusText: { fontSize: 12, color: '#444', letterSpacing: 1 },
  orbScreen: { flex: 1 },
  orbStatus: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#aaa',
    fontSize: 15,
    letterSpacing: 1,
  },
  orbHint: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#444',
    fontSize: 12,
    letterSpacing: 1,
  },
  modelToggle: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  modelChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  modelChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  modelChipText: { fontSize: 11, color: '#888', letterSpacing: 1 },
  modelChipTextActive: { color: '#0a0a0a', fontWeight: '700' },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 6,
  },
  micDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#0a0a0a' },
});
