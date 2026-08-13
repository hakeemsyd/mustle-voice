import React, { useEffect, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import type { ChatMessage } from "../hooks/useHomeChat";
import { ThumbsDownIcon, ThumbsUpIcon } from "../icons";

interface ChatTranscriptProps {
  messages: ChatMessage[];
  coachTyping: boolean;
  /** Softens the user bubble's neon tint while a voice call is live — the
   *  accent-dim reads too intense against the ambient wash behind it. */
  voiceActive?: boolean;
}

export const ChatTranscript = ({ messages, coachTyping, voiceActive = false }: ChatTranscriptProps) => {
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length, coachTyping]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.stage}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {messages.map((m) =>
        m.role === "user" ? (
          <View key={m.id} style={[styles.bubbleUser, voiceActive && styles.bubbleUserVoice]}>
            <Text style={styles.bubbleText}>{m.text}</Text>
          </View>
        ) : (
          <View key={m.id} style={styles.coachMsg}>
            <Text style={styles.coachMsgText}>{m.text}</Text>
            {/* No feedback handler exists yet — disabled rather than merely unwired, so a
                press gives no ripple/highlight instead of silently doing nothing. */}
            <View style={styles.coachMsgFeedback}>
              <Pressable hitSlop={8} disabled>
                <ThumbsUpIcon size={14} color="rgba(255,255,255,0.22)" />
              </Pressable>
              <Pressable hitSlop={8} disabled>
                <ThumbsDownIcon size={14} color="rgba(255,255,255,0.22)" />
              </Pressable>
            </View>
          </View>
        ),
      )}

      {coachTyping && (
        <View style={styles.coachMsg}>
          <Text style={styles.coachMsgTyping}>···</Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  stage: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },
  bubbleUser: {
    maxWidth: "82%",
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  bubbleUserVoice: {
    backgroundColor: "rgba(190,235,170,0.12)",
    borderColor: "rgba(190,235,170,0.3)",
  },
  bubbleText: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.text,
  },
  coachMsg: {
    alignSelf: "stretch",
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  coachMsgText: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 24,
    color: "rgba(255,255,255,0.92)",
  },
  coachMsgFeedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  coachMsgTyping: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: "rgba(255,255,255,0.4)",
  },
});
