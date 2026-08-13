import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { colors } from "../constants/theme";

const SIZE = 260;

// The hero's ambient wash — a wide, low-opacity radial sitting behind the orb.
// Separate from VoiceOrb's own ambient glow (which is tight to the orb and
// animates with voice state); this one is static and belongs to the screen.
export function HeroGlow() {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={SIZE} height={SIZE}>
        <Defs>
          <RadialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.1} />
            <Stop offset="45%" stopColor={colors.accent} stopOpacity={0.04} />
            <Stop offset="70%" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2} fill="url(#heroGlow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: "22%",
    left: "50%",
    marginLeft: -SIZE / 2,
    width: SIZE,
    height: SIZE,
  },
});
