import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * A two-frame line-art "flipbook" standing in for a real form video — flat black strokes on the
 * guide card's light panel, two poses per movement cross-fading in a loop. Two frames rather
 * than morphing one figure: far easier to keep anatomically legible at this size, and it still
 * reads clearly as a repeating rep.
 */
export type ExerciseMotion = "squat" | "hinge" | "press" | "overhead" | "pull" | "seated" | "plank";

const STROKE = "#0A0A0A";
const FLOOR = "rgba(8,8,8,0.15)";

const HOLD_MS = 700;
const FADE_MS = 400;

interface FrameProps {
  motion: ExerciseMotion;
}

function FrameA({ motion }: FrameProps) {
  switch (motion) {
    case "squat":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="20" r="7" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="60" y1="27" x2="60" y2="52" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="46" y1="34" x2="74" y2="34" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="60" y1="52" x2="50" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="52" x2="70" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "hinge":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="18" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="60" y1="25" x2="60" y2="52" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="34" x2="60" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="46" y1="60" x2="74" y2="60" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="60" y1="52" x2="57" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="52" x2="63" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "press":
      return (
        <G>
          <Line x1="24" y1="70" x2="96" y2="70" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="30" cy="58" r="7" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="37" y1="60" x2="80" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="55" y1="60" x2="55" y2="30" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="55" y1="60" x2="80" y2="30" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="46" y1="30" x2="89" y2="30" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    case "overhead":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="22" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="50" y1="36" x2="70" y2="36" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="36" x2="60" y2="58" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="50" y1="36" x2="48" y2="30" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="70" y1="36" x2="72" y2="30" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="40" y1="30" x2="80" y2="30" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="60" y1="58" x2="56" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="58" x2="64" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "pull":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="34" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="50" y1="48" x2="70" y2="48" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="48" x2="60" y2="66" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="50" y1="48" x2="46" y2="20" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="70" y1="48" x2="74" y2="20" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="38" y1="20" x2="82" y2="20" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="60" y1="66" x2="52" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="66" x2="68" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "seated":
      return (
        <G>
          <Line x1="25" y1="82" x2="95" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="46" cy="26" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="46" y1="33" x2="46" y2="56" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="46" y1="56" x2="72" y2="56" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="72" y1="56" x2="72" y2="78" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "plank":
      return (
        <G>
          <Line x1="20" y1="80" x2="100" y2="80" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="30" cy="50" r="6" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="36" y1="54" x2="88" y2="70" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="36" y1="54" x2="32" y2="80" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="88" y1="70" x2="94" y2="80" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
  }
}

function FrameB({ motion }: FrameProps) {
  switch (motion) {
    case "squat":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="38" r="7" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="60" y1="45" x2="58" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="46" y1="48" x2="74" y2="48" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="58" y1="60" x2="44" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="44" y1="60" x2="40" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="58" y1="60" x2="74" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="74" y1="60" x2="78" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "hinge":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="46" cy="32" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="52" y1="36" x2="66" y2="54" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="56" y1="42" x2="56" y2="70" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="42" y1="70" x2="70" y2="70" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="66" y1="54" x2="63" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="66" y1="54" x2="70" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "press":
      return (
        <G>
          <Line x1="24" y1="70" x2="96" y2="70" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="30" cy="58" r="7" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="37" y1="60" x2="80" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="55" y1="60" x2="42" y2="48" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="55" y1="60" x2="68" y2="48" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="34" y1="46" x2="76" y2="46" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
        </G>
      );
    case "overhead":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="26" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="50" y1="40" x2="70" y2="40" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="40" x2="60" y2="60" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="50" y1="40" x2="48" y2="12" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="70" y1="40" x2="72" y2="12" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="40" y1="12" x2="80" y2="12" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="60" y1="60" x2="56" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="60" x2="64" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "pull":
      return (
        <G>
          <Line x1="30" y1="82" x2="90" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="60" cy="30" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="50" y1="44" x2="70" y2="44" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="44" x2="60" y2="66" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="50" y1="44" x2="44" y2="41" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="70" y1="44" x2="76" y2="41" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="38" y1="41" x2="82" y2="41" stroke={STROKE} strokeWidth={4} strokeLinecap="round" />
          <Line x1="60" y1="66" x2="52" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="60" y1="66" x2="68" y2="82" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "seated":
      return (
        <G>
          <Line x1="25" y1="82" x2="95" y2="82" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="46" cy="26" r="6.5" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="46" y1="33" x2="46" y2="56" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="46" y1="56" x2="72" y2="56" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="72" y1="56" x2="96" y2="50" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
    case "plank":
      return (
        <G>
          <Line x1="20" y1="80" x2="100" y2="80" stroke={FLOOR} strokeWidth={2} strokeLinecap="round" />
          <Circle cx="30" cy="47" r="6" stroke={STROKE} strokeWidth={3} fill="none" />
          <Line x1="36" y1="51" x2="88" y2="68" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="36" y1="51" x2="32" y2="80" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
          <Line x1="88" y1="68" x2="94" y2="80" stroke={STROKE} strokeWidth={3} strokeLinecap="round" />
        </G>
      );
  }
}

export function ExerciseMotionIllustration({ motion }: { motion: ExerciseMotion }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    // Each pose holds for most of the cycle with a short cross-fade between, so the loop reads
    // as one continuous rep rather than a permanent half-blend of both frames.
    progress.value = withRepeat(
      withSequence(
        withDelay(HOLD_MS, withTiming(1, { duration: FADE_MS, easing: Easing.inOut(Easing.ease) })),
        withDelay(HOLD_MS, withTiming(0, { duration: FADE_MS, easing: Easing.inOut(Easing.ease) })),
      ),
      -1,
      false,
    );
  }, [motion]);

  const frameAStyle = useAnimatedStyle(() => ({ opacity: 1 - progress.value }));
  const frameBStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.frame, frameAStyle]}>
        <Svg width={108} height={84} viewBox="0 0 120 90" fill="none">
          <FrameA motion={motion} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.frame, frameBStyle]}>
        <Svg width={108} height={84} viewBox="0 0 120 90" fill="none">
          <FrameB motion={motion} />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Literal black-on-light colours, not theme tokens — this renders inside the guide's white
  // card, so the dark-surface palette doesn't apply.
  wrap: {
    width: "100%",
    height: 92,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(8,8,8,0.035)",
  },
  frame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
});
