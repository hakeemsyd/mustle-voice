import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ACCENT } from '../constants/theme';
import type { Message } from '../types';

interface ChatBubbleProps {
  message: Message;
  debugMode: boolean;
  playingId: string | null;
  onPlay: (msg: Message) => void;
  onStop: () => void;
}

const fmt = (d: Date) =>
  d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export function ChatBubble({ message: msg, debugMode, playingId, onPlay, onStop }: ChatBubbleProps) {
  const isPlaying = playingId === msg.id;

  return (
    <View style={[styles.row, msg.role === 'user' ? styles.rowUser : styles.rowAssistant]}>
      {msg.role === 'assistant' && <View style={styles.dot} />}

      <View style={[styles.bubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
        {msg.role === 'assistant' && <Text style={styles.senderLabel}>MUSTLE</Text>}
        <Text style={styles.bubbleText}>{msg.text}</Text>

        {msg.role === 'user' ? (
          <>
            <Text style={styles.timestamp}>{fmt(msg.timestamp)}</Text>
            {debugMode && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  onPress={() => isPlaying ? onStop() : onPlay(msg)}
                  style={[styles.pillBtn, isPlaying && styles.pillBtnActive]}
                >
                  <Text style={[styles.pillBtnText, isPlaying && styles.pillBtnTextActive]}>
                    {isPlaying ? '⏹  Stop' : '▶  Play'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <>
            {debugMode && msg.latency && (
              <View style={styles.latencyRow}>
                <Text style={styles.latencyText}>STT {msg.latency.stt}ms</Text>
                <Text style={styles.latencySep}>·</Text>
                <Text style={styles.latencyText}>Claude {msg.latency.claude}ms</Text>
                <Text style={styles.latencySep}>·</Text>
                <Text style={[styles.latencyText, styles.latencyTotal]}>Total {msg.latency.total}ms</Text>
              </View>
            )}
            {debugMode ? (
              <View style={styles.assistantFooter}>
                <Text style={styles.timestamp}>{fmt(msg.timestamp)}</Text>
                <TouchableOpacity
                  onPress={() => isPlaying ? onStop() : onPlay(msg)}
                  style={[styles.pillBtn, isPlaying && styles.pillBtnActive]}
                >
                  <Text style={[styles.pillBtnText, isPlaying && styles.pillBtnTextActive]}>
                    {isPlaying ? '⏹  Stop' : '▶  Replay'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.timestamp}>{fmt(msg.timestamp)}</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rowUser: { justifyContent: 'flex-end' },
  rowAssistant: { justifyContent: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginBottom: 8 },
  bubble: { maxWidth: '78%', borderRadius: 16, padding: 12, gap: 6 },
  bubbleUser: { backgroundColor: '#1a2a08', borderBottomRightRadius: 4 },
  bubbleAssistant: { backgroundColor: '#1a1a1a', borderBottomLeftRadius: 4 },
  senderLabel: { fontSize: 9, color: ACCENT, letterSpacing: 2 },
  bubbleText: { fontSize: 15, color: '#e0e0e0', lineHeight: 22 },
  timestamp: { fontSize: 10, color: '#3a3a3a' },
  assistantFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  pillBtnActive: { borderColor: ACCENT },
  pillBtnText: { fontSize: 12, color: '#e0e0e0', fontWeight: '600' },
  pillBtnTextActive: { color: ACCENT },
  latencyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  latencyText: { fontSize: 10, color: '#3a3a3a', fontVariant: ['tabular-nums'] },
  latencySep: { fontSize: 10, color: '#2a2a2a' },
  latencyTotal: { color: '#555' },
});
