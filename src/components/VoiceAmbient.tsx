import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import type { OrbState } from "./VoiceOrb";
import { orbColors, colors } from "../constants/theme";

// Bottom-anchored wash reflecting the live voice phase — the design's stand-in for the
// orb once a conversation is open: color + intensity shift per phase instead of a big orb.
const PHASE_COLOR: Record<OrbState, string> = {
  idle: orbColors.listening,
  breathing: orbColors.listening,
  listening: orbColors.listening,
  processing: orbColors.processing,
  speaking: colors.accent,
};

const PHASE_OPACITY: Record<OrbState, number> = {
  idle: 0.5,
  breathing: 0.5,
  listening: 0.75,
  processing: 0.7,
  speaking: 0.75,
};

export function VoiceAmbient({ state, active }: { state: OrbState; active: boolean }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(active ? PHASE_OPACITY[state] : 0, {
      duration: 450,
      easing: Easing.inOut(Easing.ease),
    });
    return () => cancelAnimation(opacity);
  }, [active, state]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const color = PHASE_COLOR[state];

  return (
    <Animated.View style={[styles.wrap, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="voiceAmbient" cx="50%" cy="100%" r="75%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <Stop offset="45%" stopColor={color} stopOpacity={0.2} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="50%" cy="100%" r="75%" fill="url(#voiceAmbient)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
  },
});
