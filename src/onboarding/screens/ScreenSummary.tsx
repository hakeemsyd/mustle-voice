import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ProgressDots } from "../ProgressDots";
import { BackIcon } from "../../icons/BackIcon";
import { colors, fonts } from "../../constants/theme";
import { type OnboardingState } from "../useOnboardingState";

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  prefer_not_to_say: "Prefer not to say",
};

/* screen indices for edit navigation */
const EDIT_SCREENS: Record<string, number> = {
  gender: 2,
  name: 3,
  trainingHistory: 4,
  primaryGoal: 5,
  weeklyFrequency: 6,
  height: 7,
  weight: 7,
  injuries: 8,
};

interface ScreenSummaryProps {
  state: OnboardingState;
  onNavigateTo: (screenIndex: number) => void;
  onBack: () => void;
  onComplete: () => void;
}

export const ScreenSummary = ({
  state,
  onNavigateTo,
  onBack,
  onComplete,
}: ScreenSummaryProps) => {
  const injuryValue = (() => {
    if (state.injuries.length === 0 && !state.injuryDescription)
      return "Nothing flagged";
    const parts: string[] = [];
    if (state.injuries.length > 0) parts.push(state.injuries.join(", "));
    if (state.injuryDescription) parts.push(state.injuryDescription);
    return parts.join(" — ");
  })();

  const heightVal = state.height || "—";
  const weightVal = state.weight
    ? `${state.weight} ${state.units === "imperial" ? "lbs" : "kg"}`
    : "—";

  const rows: {
    key: string;
    label: string;
    value: string;
    screenKey: string;
  }[] = [
    {
      key: "name",
      label: "NAME",
      value: state.userName || "—",
      screenKey: "name",
    },
    {
      key: "gender",
      label: "GENDER",
      value: state.gender ? GENDER_LABELS[state.gender] : "—",
      screenKey: "gender",
    },
    {
      key: "trainingHistory",
      label: "EXPERIENCE",
      value: state.trainingHistory || "—",
      screenKey: "trainingHistory",
    },
    {
      key: "primaryGoal",
      label: "GOAL",
      value: state.primaryGoal || "—",
      screenKey: "primaryGoal",
    },
    {
      key: "weeklyFrequency",
      label: "FREQUENCY",
      value: state.weeklyFrequency ? `${state.weeklyFrequency}× per week` : "—",
      screenKey: "weeklyFrequency",
    },
    { key: "height", label: "HEIGHT", value: heightVal, screenKey: "height" },
    { key: "weight", label: "WEIGHT", value: weightVal, screenKey: "weight" },
    {
      key: "injuries",
      label: "AVOID",
      value: injuryValue,
      screenKey: "injuries",
    },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable style={styles.topBarSpacer} onPress={onBack} hitSlop={12}>
          <BackIcon />
        </Pressable>

        <ProgressDots total={13} current={13} />

        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>
          READY,{" "}
          <Text style={styles.titleAccent}>
            {state.userName ? state.userName.toUpperCase() : "ATHLETE"}.
          </Text>
        </Text>
        <Text style={styles.subline}>
          Here's what I know about you — tap any row to edit.
        </Text>
      </View>

      <ScrollView
        style={styles.rows}
        contentContainerStyle={styles.rowsContent}
      >
        {rows.map((row) => (
          <Pressable
            key={row.key}
            style={styles.row}
            onPress={() => onNavigateTo(EDIT_SCREENS[row.screenKey])}
          >
            <Text style={styles.rowKey}>{row.label}</Text>
            <Text style={styles.rowVal} numberOfLines={2}>
              {row.value}
            </Text>
            <Text style={styles.rowArrow}>→</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.cta}>
        <Pressable style={styles.btnLime} onPress={onComplete}>
          <Text style={styles.btnLimeText}>CREATE ACCOUNT</Text>
        </Pressable>
        <Text style={styles.ctaNote}>
          Account creation is required to start training.
        </Text>
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

  header: {
    paddingHorizontal: 24,
    paddingTop: 42,
    paddingBottom: 20,
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 40,
    lineHeight: 40,
    color: colors.text,
    marginBottom: 8,
  },

  titleAccent: {
    color: colors.accent,
  },

  subline: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: "#666666",
  },

  rows: {
    flex: 1,
  },

  rowsContent: {
    paddingHorizontal: 24,
    gap: 2,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 12,
  },

  rowKey: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 1,
    color: "#555555",
    width: 84,
  },

  rowVal: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
    flex: 1,
  },

  rowArrow: {
    fontSize: 12,
    color: "rgba(255,255,255,0.15)",
  },

  cta: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },

  btnLime: {
    width: "100%",
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },

  btnLimeText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.accentOn,
  },

  ctaNote: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "#444444",
    textAlign: "center",
    marginTop: 12,
  },
});
