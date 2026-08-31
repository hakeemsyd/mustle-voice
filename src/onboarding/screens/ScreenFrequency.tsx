import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { ProgressDots } from "../ProgressDots";
import { WheelPicker } from "../../components/WheelPicker";
import { fonts, colors } from "../../constants/theme";
import { BackIcon } from "../../icons/BackIcon";

interface ScreenFrequencyProps {
  initialDays?: number;
  onNext: (days: number) => void;
  onBack: () => void;
}

const MIN_DAYS = 0; // 0 is a real answer — "I don't currently train"
const MAX_DAYS = 7;
const DEFAULT_DAYS = 4;

// Wheel-based, not free text/voice — the wheel can never produce an invalid
// value, unlike the old ConversationalScreen + normalizeSpokenNumbers path it
// replaces (confirmed live: "88 days a week" was accepted and displayed as-is).
export const ScreenFrequency = ({ initialDays, onNext, onBack }: ScreenFrequencyProps) => {
  const [days, setDays] = useState(initialDays ?? DEFAULT_DAYS);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarSpacer} activeOpacity={0.7} onPress={onBack}>
          <BackIcon />
        </TouchableOpacity>

        <ProgressDots total={11} current={6} />

        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>YOUR SCHEDULE</Text>
        <Text style={styles.title}>How many days can you train?</Text>
        <Text style={styles.subtitle}>Be realistic, not aspirational — pick what you'll actually do.</Text>

        <View style={styles.wheelArea}>
          <WheelPicker
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={days}
            onChange={setDays}
            accessibilityLabel="Training days per week"
          />
          <Text style={styles.wheelSuffix}>DAYS / WEEK</Text>
        </View>
      </View>

      <View style={styles.cta}>
        <TouchableOpacity style={styles.ctaBtn} activeOpacity={0.85} onPress={() => onNext(days)}>
          <Text style={styles.ctaBtnText}>CONTINUE</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 60,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  topBarSpacer: {
    width: 32,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 1.2,
    color: "rgba(200,241,53,0.65)",
  },
  title: {
    marginTop: 20,
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 42,
    color: colors.text,
  },
  subtitle: {
    marginTop: 14,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  wheelArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  wheelSuffix: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  cta: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  ctaBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaBtnText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.bg,
  },
});
