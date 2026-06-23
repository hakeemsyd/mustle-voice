import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChatBubble } from './ChatBubble';
import { ACCENT } from '../constants/theme';
import type { AppStatus, Message } from '../types';

interface ChatListProps {
  messages: Message[];
  status: AppStatus;
  debugMode: boolean;
  playingId: string | null;
  onPlay: (msg: Message) => void;
  onStop: () => void;
}

export function ChatList({ messages, status, debugMode, playingId, onPlay, onStop }: ChatListProps) {
  const scrollRef = useRef<ScrollView>(null);
  const isProcessing = status === 'transcribing' || status === 'thinking';

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.chat}
      contentContainerStyle={styles.chatContent}
      showsVerticalScrollIndicator={false}
    >
      {messages.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Tap the button and talk to your coach</Text>
        </View>
      )}

      {messages
        .filter(msg => msg.role === 'user' || msg.text.length > 0)
        .map(msg => (
          <ChatBubble
            key={msg.id}
            message={msg}
            debugMode={debugMode}
            playingId={playingId}
            onPlay={onPlay}
            onStop={onStop}
          />
        ))}

      {isProcessing && (
        <View style={[styles.row, styles.rowAssistant]}>
          <View style={styles.dot} />
          <View style={styles.processingBubble}>
            <Text style={styles.processingText}>
              {status === 'transcribing' ? 'Transcribing...' : 'Thinking...'}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chat: { flex: 1 },
  chatContent: { padding: 16, gap: 10, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 },
  emptyText: { color: '#2e2e2e', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rowAssistant: { justifyContent: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginBottom: 8 },
  processingBubble: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    padding: 12,
  },
  processingText: { fontSize: 13, color: '#444', fontStyle: 'italic' },
});
