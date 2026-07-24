import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { VoiceOrb } from "../components/VoiceOrb";
import { BottomSheet } from "../components/BottomSheet";
import { FloatingParticles } from "../components/FloatingParticles";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { colors, fonts } from "../constants/theme";
import { CalendarIcon, MenuIcon, SunIcon } from "../icons";
import {
  getMomentumLine,
  MOCK_COACH_MESSAGE,
  MOCK_MACROS,
  MOCK_STREAK_DAYS,
  MOCK_TODAY_SESSION,
} from "./homeMockData";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning.";
  if (hour < 18) return "Afternoon.";
  return "Evening.";
}

export function HomeScreen() {
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const { orbState, isActive, toggle } = useVoiceSession();

  const protein = MOCK_MACROS[0];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <Pressable style={styles.menuBtn} hitSlop={10}>
            <MenuIcon size={18} color={colors.muted} />
          </Pressable>
          <Text style={styles.brand}>MUSTLE</Text>
        </View>

        <Pressable
          style={styles.macroChip}
          onPress={() => setNutritionOpen(true)}
        >
          <Text style={styles.macroChipValue}>{protein.current}</Text>
          <Text style={styles.macroChipSep}>/</Text>
          <Text style={styles.macroChipGoal}>{protein.goal}g</Text>
          <Text style={styles.macroChipLabel}>Protein</Text>
          <Text style={styles.macroChipArrow}>▾</Text>
        </Pressable>
      </View>

      <View style={styles.rule} />

      <View style={styles.hero}>
        <FloatingParticles />

        <View style={styles.heroTop}>
          <View style={styles.captionIconRow}>
            <SunIcon size={18} color="rgba(251,180,60,0.85)" />
          </View>
          <Text style={styles.captionGreeting}>{getGreeting()}</Text>
          <Text style={styles.captionMain}>{MOCK_COACH_MESSAGE}</Text>
          <Text style={styles.captionSub}>
            {getMomentumLine(MOCK_STREAK_DAYS)}
          </Text>

          <View style={styles.metaRow}>
            {MOCK_TODAY_SESSION.hasSession ? (
              <View style={styles.slimSession}>
                <View style={styles.slimSessionDot} />
                <Text style={styles.slimSessionName}>
                  {MOCK_TODAY_SESSION.name}
                </Text>
                <Text style={styles.slimSessionTime}>
                  {MOCK_TODAY_SESSION.startsInLabel}
                </Text>
                <Text style={styles.slimSessionArrow}>→</Text>
              </View>
            ) : (
              <View style={styles.restLine}>
                <View style={styles.restLineDot} />
                <Text style={styles.restLineText}>
                  Rest day — focus on recovery
                </Text>
              </View>
            )}

            <View style={styles.planPill}>
              <CalendarIcon size={12} color={colors.accent} />
              <Text style={styles.planPillText}>This week's plan</Text>
            </View>
          </View>
        </View>

        <View style={styles.orbWrap}>
          <Pressable style={styles.orbBtn} onPress={toggle} hitSlop={16}>
            <VoiceOrb state={orbState} size={115} />
          </Pressable>
          <Text style={styles.orbHint}>
            {isActive ? "tap to stop" : "tap to talk"}
          </Text>
        </View>
      </View>

      <BottomSheet
        visible={nutritionOpen}
        onClose={() => setNutritionOpen(false)}
      >
        <View style={styles.macroSheetBody}>
          <Text style={styles.macroPanelTitle}>TODAY'S NUTRITION</Text>
          {MOCK_MACROS.map((m) => {
            const pct = Math.min(Math.round((m.current / m.goal) * 100), 100);
            const remaining = m.goal - m.current;
            return (
              <View key={m.key} style={styles.macroRow}>
                <View style={styles.macroRowTop}>
                  <View
                    style={[styles.macroRowDot, { backgroundColor: m.color }]}
                  />
                  <Text style={styles.macroRowLabel}>{m.label}</Text>
                  <View style={styles.macroRowValues}>
                    <Text style={[styles.macroRowCurrent, { color: m.color }]}>
                      {m.current}
                    </Text>
                    <Text style={styles.macroRowSep}>/</Text>
                    <Text style={styles.macroRowGoal}>
                      {m.goal}
                      {m.unit}
                    </Text>
                  </View>
                </View>
                <View style={styles.macroRowBar}>
                  <View
                    style={[
                      styles.macroRowFill,
                      { width: `${pct}%`, backgroundColor: m.color },
                    ]}
                  />
                </View>
                <Text style={styles.macroRowRemaining}>
                  {remaining}
                  {m.unit} remaining
                </Text>
              </View>
            );
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    height: 48,
  },

  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  menuBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.accent,
    letterSpacing: 1.6,
  },

  macroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  macroChipValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.accent,
  },
  macroChipSep: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
  },
  macroChipGoal: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  macroChipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    marginLeft: 1,
  },
  macroChipArrow: {
    fontSize: 7,
    color: "rgba(255,255,255,0.2)",
    marginLeft: 1,
  },

  rule: {
    height: 1,
    backgroundColor: colors.accentDim,
    marginHorizontal: 22,
  },

  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 22,
    paddingBottom: 12,
  },

  heroTop: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 32,
  },

  captionIconRow: { marginBottom: 2 },

  captionGreeting: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },

  captionMain: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 27,
    marginTop: 4,
    marginBottom: 2,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
  },

  captionSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.32)",
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },

  slimSession: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
  },
  slimSessionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  slimSessionName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.text,
  },
  slimSessionTime: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
  },
  slimSessionArrow: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.accent,
    marginLeft: 2,
  },

  restLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  restLineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restLineText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },

  planPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 100,
  },
  planPillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
  },

  orbWrap: {
    alignItems: "center",
    gap: 22,
    marginTop: "auto",
    marginBottom: "auto",
  },
  orbBtn: { alignItems: "center", justifyContent: "center" },
  orbHint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: "rgba(255,255,255,0.2)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  macroSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 16,
  },
  macroPanelTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.3)",
    marginBottom: 2,
  },
  macroRow: { gap: 6 },
  macroRowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  macroRowDot: { width: 7, height: 7, borderRadius: 3.5 },
  macroRowLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  macroRowValues: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  macroRowCurrent: { fontFamily: fonts.display, fontSize: 19 },
  macroRowSep: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.22)",
  },
  macroRowGoal: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
  },
  macroRowBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  macroRowFill: { height: "100%", borderRadius: 2 },
  macroRowRemaining: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.28)",
  },
});
