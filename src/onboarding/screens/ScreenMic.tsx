import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Line, Path, Rect } from "react-native-svg";

import { Orb, type OrbState } from "../Orb";
import { ProgressDots } from "../ProgressDots";
import { requestMicPermission } from "../requestMicPermission";
import { useSpeakOnMount } from "../useSpeakOnMount";
import { MIC_PROMPT } from "../prompts";

import { colors, fonts } from "../../constants/theme";
import { useWordTyping } from "../../hooks/useWordTyping";

const COACH_MSG = MIC_PROMPT;

type MicPhase = "typing" | "shrinking" | "ready";
type SubScreen = "main" | "nomic";

interface ScreenMicProps {
  onNext: (micEnabled: boolean) => void;
  onBack?: () => void;
}

export const ScreenMic = ({ onNext }: ScreenMicProps) => {
  const [subScreen, setSubScreen] = useState<SubScreen>("main");
  const [phase, setPhase] = useState<MicPhase>("typing");
  const [requesting, setRequesting] = useState(false);

  const fontSize = useSharedValue(22);
  const lineHeight = useSharedValue(31);
  const marginTop = useSharedValue(56);
  const opacity = useSharedValue(1);

  const animatedMessageStyle = useAnimatedStyle(() => ({
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    marginTop: marginTop.value,
    opacity: opacity.value,
  }));

  const handleAllow = async () => {
    if (requesting) return;

    setRequesting(true);

    const granted = await requestMicPermission();

    setRequesting(false);

    onNext(granted);
  };

  const { audioDone, audioStarted } = useSpeakOnMount(COACH_MSG);

  const { count, isDone, words } = useWordTyping(
    COACH_MSG,
    phase === "typing" && subScreen === "main" && audioStarted,
  );

  useEffect(() => {
    if (phase === "typing" && isDone && audioDone) {
      const timer = setTimeout(() => {
        setPhase("shrinking");
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [phase, isDone, audioDone]);

  useEffect(() => {
    if (phase === "shrinking") {
      fontSize.value = withTiming(14, {
        duration: 350,
      });

      lineHeight.value = withTiming(20, {
        duration: 350,
      });

      marginTop.value = withTiming(12, {
        duration: 350,
      });

      opacity.value = withTiming(0.55, {
        duration: 350,
      });

      const timer = setTimeout(() => {
        setPhase("ready");
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [phase]);

  const orbState: OrbState = phase === "typing" ? "speaking" : "breathing";

  const ctaVisible = phase === "ready";

  if (subScreen === "nomic") {
    return (
      <NomicScreen
        onEnable={handleAllow}
        onSkip={() => onNext(false)}
        onBack={() => setSubScreen("main")}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={styles.topBarSpacer} />
        <ProgressDots total={11} current={1} />
      </View>

      <View style={styles.orbArea}>
        <Orb state={orbState} size={140} />
      </View>

      <Animated.Text
        style={[
          styles.message,
          { fontFamily: phase === "typing" ? fonts.bodyExtraBold : fonts.bodyMedium },
          animatedMessageStyle,
        ]}
      >
        {phase === "typing" ? words.slice(0, count).join(" ") : COACH_MSG}
      </Animated.Text>

      {ctaVisible && (
        <Animated.View style={styles.actions} entering={FadeInUp.duration(300)}>
          <Pressable
            style={[styles.btnLime, requesting && styles.btnLimeBusy]}
            disabled={requesting}
            onPress={handleAllow}
          >
            <Text style={styles.btnLimeText}>ALLOW MICROPHONE</Text>
          </Pressable>

          <Pressable
            style={styles.btnText}
            onPress={() => setSubScreen("nomic")}
          >
            <Text style={styles.btnTextLabel}>Not now</Text>
          </Pressable>
        </Animated.View>
      )}
    </SafeAreaView>
  );
};

interface NomicScreenProps {
  onEnable: () => Promise<void>;
  onSkip: () => void;
  onBack: () => void;
}

const NomicScreen = ({ onEnable, onSkip, onBack }: NomicScreenProps) => {
  const [busy, setBusy] = useState(false);

  const wave1 = useSharedValue(0.3);
  const wave2 = useSharedValue(0.3);
  const pulse = useSharedValue(0);

  const handleEnable = async () => {
    if (busy) return;

    setBusy(true);

    await onEnable();

    setBusy(false);
  };

  useEffect(() => {
    wave1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0.3, { duration: 1000 }),
      ),
      -1,
      false,
    );

    wave2.value = withRepeat(
      withSequence(
        withTiming(0.3, { duration: 500 }),
        withTiming(1, { duration: 1000 }),
        withTiming(0.3, { duration: 500 }),
      ),
      -1,
      false,
    );

    pulse.value = withRepeat(
      withTiming(1, {
        duration: 2400,
        easing: Easing.out(Easing.ease),
      }),
      -1,
      false,
    );
  }, [wave1, wave2, pulse]);

  const wave1Style = useAnimatedStyle(() => ({
    opacity: wave1.value,
  }));

  const wave2Style = useAnimatedStyle(() => ({
    opacity: wave2.value,
  }));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>

        <ProgressDots total={11} current={1} />
      </View>

      <View style={styles.nomicContent}>
        <View style={styles.micAnimWrap}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Rect
              x={28}
              y={8}
              width={24}
              height={36}
              rx={12}
              fill="rgba(200,241,53,0.12)"
              stroke="#C8F135"
              strokeWidth={1.5}
            />

            <Path
              d="M18 40c0 12.15 9.85 22 22 22s22-9.85 22-22"
              stroke="#C8F135"
              strokeWidth={1.5}
              strokeLinecap="round"
              fill="none"
            />

            <Line
              x1={40}
              y1={62}
              x2={40}
              y2={72}
              stroke="#C8F135"
              strokeWidth={1.5}
              strokeLinecap="round"
            />

            <Line
              x1={28}
              y1={72}
              x2={52}
              y2={72}
              stroke="#C8F135"
              strokeWidth={1.5}
              strokeLinecap="round"
            />

            <Animated.View style={wave1Style}>
              <Path
                d="M14 40c0 14.36 11.64 26 26 26s26-11.64 26-26"
                stroke="rgba(200,241,53,0.25)"
                strokeWidth={1}
                fill="none"
                strokeLinecap="round"
              />
            </Animated.View>

            <Animated.View style={wave2Style}>
              <Path
                d="M6 40c0 18.78 15.22 34 34 34s34-15.22 34-34"
                stroke="rgba(200,241,53,0.12)"
                strokeWidth={1}
                fill="none"
                strokeLinecap="round"
              />
            </Animated.View>
          </Svg>
        </View>

        <View style={styles.nomicText}>
          <Text style={styles.nomicTitle}>Mustle is voice-first.</Text>

          <Text style={styles.nomicBody}>
            Your coach listens, reacts, and pushes you — all through voice.
            Without a mic, you lose the core experience.
          </Text>

          <Text style={styles.nomicNote}>
            Microphone access is required for the full experience.
          </Text>
        </View>
      </View>

      <View style={styles.nomicActions}>
        <Pressable
          style={[styles.btnLime, busy && styles.btnLimeBusy]}
          disabled={busy}
          onPress={handleEnable}
        >
          <Text style={styles.btnLimeText}>ENABLE MICROPHONE</Text>
        </Pressable>

        <Pressable style={styles.btnText} onPress={onSkip}>
          <Text style={styles.btnTextLabel}>Continue without voice</Text>
        </Pressable>
      </View>
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

  btnLimeBusy: {
    opacity: 0.6,
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

  nomicContent: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 32,
    gap: 40,
  },

  micAnimWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },

  nomicText: {
    alignItems: "center",
    gap: 12,
  },

  nomicTitle: {
    fontFamily: fonts.display,
    fontSize: 28,
    letterSpacing: 0.4,
    color: colors.text,
    textAlign: "center",
  },

  nomicBody: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 23,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },

  nomicNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "rgba(255,255,255,0.35)",
    textAlign: "center",
  },

  nomicActions: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 16,
  },
});
