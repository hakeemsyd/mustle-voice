import React, { useEffect, useRef } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../../constants/theme";
import { MMark } from "../../icons/MMark";
import { ArrowRightIcon } from "../../icons/ArrowRightIcon";
import { CoachMessageText } from "../CoachMessageText";

export interface SessionChatMessage {
  id: string;
  role: "coach" | "user";
  text: string;
  /** Optional inline action under a coach message — used by the "last time" beat to jump to
   *  that session's own report. */
  link?: { label: string; onPress: () => void };
  /** A photo the user attached — rendered in place of the message's text. */
  imageUrl?: string;
}

interface SessionChatThreadProps {
  messages: SessionChatMessage[];
  typing?: boolean;
  /** Rendered as the last row inside the scroll, under the message that offered it — the
   *  quick-reply chips belong to the thread (they scroll with it and sit above the card), not
   *  to a fixed row between the card and the input dock. */
  footer?: React.ReactNode;
}

export function SessionChatThread({ messages, typing = false, footer }: SessionChatThreadProps) {
  const scrollRef = useRef<ScrollView>(null);

  // Keyed on whether a footer is present, not on the node itself — `footer` is a fresh element
  // every render, which would re-arm this timer on every keystroke.
  const hasFooter = footer != null;

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages.length, typing, hasFooter]);

  return (
    <View style={styles.stage}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) =>
          m.role === "user" ? (
            <View key={m.id} style={m.imageUrl ? styles.userImageRow : styles.userRow}>
              {m.imageUrl ? (
                <Image source={{ uri: m.imageUrl }} style={styles.userImage} resizeMode="cover" />
              ) : (
                <Text style={styles.userText}>{m.text}</Text>
              )}
            </View>
          ) : (
            <View key={m.id} style={styles.coachRow}>
              <View style={styles.coachAvatar}>
                <MMark size={10.8} color={colors.accentOn} />
              </View>
              <View style={styles.coachTextCol}>
                <CoachMessageText text={m.text} style={styles.coachText} variant="plain" />
                {m.link && (
                  <Pressable style={styles.coachLink} onPress={m.link.onPress} hitSlop={6}>
                    <Text style={styles.coachLinkText}>{m.link.label}</Text>
                    <ArrowRightIcon size={12} color={colors.accent} />
                  </Pressable>
                )}
              </View>
            </View>
          ),
        )}

        {typing && (
          <View style={styles.coachRow}>
            <View style={styles.coachAvatar}>
              <MMark size={10.8} color={colors.accentOn} />
            </View>
            <Text style={styles.coachTyping}>···</Text>
          </View>
        )}

        {footer}
      </ScrollView>

      {/* The gap between the thread and the white card was a hard cutoff — content simply
          stopped mid-line against flat black. Fades the last 48px into the background instead,
          matching the reference's own bottom mask on this scroll box. */}
      <LinearGradient
        colors={["rgba(8,8,8,0)", colors.bg]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 52,
    gap: 16,
  },
  userRow: {
    maxWidth: "84%",
    alignSelf: "flex-end",
  },
  userText: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "right",
    color: colors.muted,
  },
  userImageRow: {
    alignSelf: "flex-end",
    maxWidth: "60%",
  },
  userImage: {
    width: "100%",
    height: 220,
    borderRadius: 14,
  },
  coachRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    alignSelf: "stretch",
    gap: 8,
  },
  coachAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    marginTop: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  coachTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  coachText: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  coachLink: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
  },
  coachLinkText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.accent,
  },
  coachTyping: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: "rgba(255,255,255,0.4)",
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 48,
  },
});
