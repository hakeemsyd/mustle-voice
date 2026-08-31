import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { Orb, type OrbState } from "../Orb";
import { ProgressDots } from "../ProgressDots";
import { BackIcon } from "../../icons/BackIcon";
import { useSpeakOnMount } from "../useSpeakOnMount";
import { PUSH_PROMPT } from "../prompts";

import { colors, fonts } from "../../constants/theme";
import { useWordTyping } from "../../hooks/useWordTyping";

const COACH_MSG = PUSH_PROMPT;

// Matches the source's collapsed "speaking" → "ready" model (see mustle-mvp's ScreenPush.tsx/
// ScreenMic.tsx header comments) — the message renders at its one, final small size from the
// first word, no separate shrink-animation phase. This screen previously still ran the old
// retired big→small animation (its own copy, not shared with ScreenMic/ConversationalScreen),
// same bug those two had before their own fixes.
type Phase = "typing" | "ready";

interface ScreenPushProps {
  onNext: (enabled: boolean) => void;
  onBack: () => void;
}

const WORD_EASE = Easing.bezier(0.2, 0, 0.2, 1);

function RevealWord({
  text,
  revealed,
  isLast,
}: {
  text: string;
  revealed: boolean;
  isLast: boolean;
}) {
  const progress = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    if (revealed)
      progress.value = withTiming(1, { duration: 220, easing: WORD_EASE });
  }, [revealed]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 6 }],
  }));
  return (
    <Animated.Text style={[styles.message, style]}>
      {text}
      {isLast ? "" : " "}
    </Animated.Text>
  );
}

export const ScreenPush = ({ onNext, onBack }: ScreenPushProps) => {
  const [phase, setPhase] = useState<Phase>("typing");

  const { audioDone, audioStarted } = useSpeakOnMount(COACH_MSG);
  const { count, isDone, words } = useWordTyping(
    COACH_MSG,
    phase === "typing" && audioStarted,
  );

  useEffect(() => {
    if (phase === "typing" && isDone && audioDone) {
      const timer = setTimeout(() => setPhase("ready"), 100);
      return () => clearTimeout(timer);
    }
  }, [phase, isDone, audioDone]);

  const orbState: OrbState = phase === "typing" ? "speaking" : "typing";
  const ctaVisible = phase === "ready";

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.topBarSpacer} onPress={onBack} hitSlop={12}>
          <BackIcon />
        </Pressable>

        <ProgressDots total={11} current={9} />

        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.orbArea}>
        <Orb state={orbState} size={140} />
      </View>

      <Text style={styles.message}>
        {words.map((w, i) => (
          <RevealWord
            key={i}
            text={w}
            isLast={i === words.length - 1}
            revealed={phase !== "typing" || i < count}
          />
        ))}
      </Text>

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

  topBarSpacer: {
    width: 32,
  },

  orbArea: {
    alignItems: "center",
    paddingTop: 12,
  },

  // Matches instantReveal's final ("shrank") state — see ScreenMic.tsx/ConversationalScreen.tsx
  // for the same fix and rationale.
  message: {
    textAlign: "center",
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 20,
    opacity: 0.65,
    marginTop: 36,
    color: colors.text,
    maxWidth: 300,
    alignSelf: "center",
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
