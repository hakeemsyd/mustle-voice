import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors, fonts } from "../constants/theme";

export type CoachCardState = "idle" | "listening" | "thinking" | "speaking";

interface SessionCoachCardProps {
  state: CoachCardState;
  message: string;
}

const BADGE: Record<CoachCardState, string> = {
  idle: "COACH",
  listening: "LISTENING",
  thinking: "THINKING",
  speaking: "COACH",
};

function LiveDot() {
  const t = useSharedValue(1);

  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 500, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }),
      ),
      -1,
    );
    return () => cancelAnimation(t);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.8 + t.value * 0.2 }] }));

  return <Animated.View style={[styles.liveDot, style]} />;
}

// Persistent coach layer — the design keeps this visible through every phase
// (including rest), so the coach never disappears mid-session. Left border
// goes lime only while speaking; the badge row carries the live state.
export function SessionCoachCard({ state, message }: SessionCoachCardProps) {
  const live = state === "listening" || state === "thinking";

  return (
    <View style={[styles.card, state === "speaking" && styles.cardSpeaking]}>
      <View style={styles.badgeRow}>
        {live && <LiveDot />}
        <Text style={[styles.badge, live && styles.badgeLive]}>{BADGE[state]}</Text>
      </View>
      <Text style={styles.message} numberOfLines={4} ellipsizeMode="tail">
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    minHeight: 64,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(17,17,17,0.85)",
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
  },
  cardSpeaking: {
    borderLeftColor: colors.accent,
    backgroundColor: "rgba(26,26,26,0.9)",
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  badgeLive: {
    color: colors.text,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text,
  },
  message: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
});
