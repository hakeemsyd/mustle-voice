import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors, fonts } from "../constants/theme";

interface VoiceButtonProps {
  onPress?: () => void;
}

const AnimatedDot = ({ delay }: { delay: number }) => {
  const opacity = useSharedValue(0.6);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(1, { duration: 400 })),
        withTiming(0.6, { duration: 400 }),
      ),
      -1,
      false,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

export const VoiceButton = ({ onPress }: VoiceButtonProps) => {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>YOU SPEAK</Text>

        <View style={styles.dotsContainer}>
          <AnimatedDot delay={0} />
          <AnimatedDot delay={180} />
          <AnimatedDot delay={360} />
        </View>
      </View>
      <Text style={styles.hint}>Tap when you're done</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.35)",
    backgroundColor: "rgba(200,241,53,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.accent,
  },

  hint: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.35)",
  },

  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(200,241,53,0.6)",
  },
});
