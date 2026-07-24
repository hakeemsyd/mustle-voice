import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Orb, type OrbState } from "../Orb";
import { ProgressDots } from "../ProgressDots";

import { colors, fonts } from "../../constants/theme";
import { useWordTyping } from "../../hooks/useWordTyping";

const COACH_MSG = "I'll check in with you on rest days and keep you on track — cool?";

type Phase = "typing" | "shrinking" | "ready";

interface ScreenPushProps {
  onNext: (enabled: boolean) => void;
  onBack: () => void;
}

export const ScreenPush = ({ onNext, onBack }: ScreenPushProps) => {
  const [phase, setPhase] = useState<Phase>("typing");

  const fontSize = useSharedValue(26);
  const lineHeight = useSharedValue(34);
  const marginTop = useSharedValue(56);
  const opacity = useSharedValue(1);

  const animatedMessageStyle = useAnimatedStyle(() => ({
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    marginTop: marginTop.value,
    opacity: opacity.value,
  }));

  const { count, isDone, words } = useWordTyping(COACH_MSG, phase === "typing");

  useEffect(() => {
    if (phase === "typing" && isDone) {
      const timer = setTimeout(() => setPhase("shrinking"), 300);
      return () => clearTimeout(timer);
    }
  }, [phase, isDone]);

  useEffect(() => {
    if (phase === "shrinking") {
      fontSize.value = withTiming(14, { duration: 350 });
      lineHeight.value = withTiming(20, { duration: 350 });
      marginTop.value = withTiming(12, { duration: 350 });
      opacity.value = withTiming(0.6, { duration: 350 });

      const timer = setTimeout(() => setPhase("ready"), 350);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  const orbState: OrbState = phase === "typing" ? "speaking" : "breathing";
  const ctaVisible = phase === "ready";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <ProgressDots total={11} current={9} />
      </View>

      <View style={styles.orbArea}>
        <Orb state={orbState} size={140} />
      </View>

      <Animated.Text style={[styles.message, animatedMessageStyle]}>
        {phase === "typing" ? words.slice(0, count).join(" ") : COACH_MSG}
      </Animated.Text>

      {ctaVisible && (
        <Animated.View style={styles.actions} entering={FadeInUp.duration(300)}>
          <Pressable style={styles.btnLime} onPress={() => onNext(true)}>
            <Text style={styles.btnLimeText}>TURN ON NOTIFICATIONS</Text>
          </Pressable>

          <Pressable style={styles.btnText} onPress={() => onNext(false)}>
            <Text style={styles.btnTextLabel}>Maybe later</Text>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  backArrow: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 20,
    paddingRight: 8,
  },

  orbArea: {
    alignItems: "center",
    paddingTop: 20,
  },

  message: {
    textAlign: "center",
    fontFamily: fonts.bodyExtraBold,
    color: colors.text,
    maxWidth: 300,
    alignSelf: "center",
    paddingHorizontal: 8,
  },

  actions: {
    marginTop: "auto",
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },

  btnLime: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },

  btnLimeText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.accentOn,
  },

  btnText: {
    alignItems: "center",
    padding: 8,
  },

  btnTextLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
  },
});
