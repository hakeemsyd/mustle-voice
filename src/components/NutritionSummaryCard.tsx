import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { UtensilsIcon } from "../icons";
import { ProgressRing } from "./ProgressRing";
import type { NutritionSummaryCard as NutritionSummaryCardData } from "../lib/brain";

interface NutritionSummaryCardProps {
  card: NutritionSummaryCardData;
}

const MACRO_COLORS: Record<string, string> = {
  Protein: colors.chartProtein,
  Carbs: colors.chartCarbs,
  Fat: colors.chartFat,
};

export function NutritionSummaryCard({ card }: NutritionSummaryCardProps) {
  // The ring fill represents progress made (calories consumed), not what's left —
  // an empty ring at the start of the day and a filling ring as meals are logged.
  const consumed = card.calories_target - card.calories_left;
  const progress =
    card.calories_target > 0
      ? Math.max(0, Math.min(1, consumed / card.calories_target))
      : 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <UtensilsIcon size={18} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>TODAY'S FUEL</Text>
          <Text style={styles.subtitle}>
            Macro summary · Personalized by MUSTLE
          </Text>
        </View>
      </View>

      <View style={styles.ringWrap}>
        <ProgressRing
          size={168}
          strokeWidth={14}
          progress={progress}
          color={colors.accent}
        >
          <Text style={styles.ringValue}>{card.calories_left}</Text>
          <Text style={styles.ringLabel}>CAL LEFT</Text>
        </ProgressRing>
      </View>

      <View style={styles.macrosRow}>
        {card.macros.map((m) => (
          <View key={m.label} style={styles.macroCol}>
            <View
              style={[
                styles.macroDot,
                { backgroundColor: MACRO_COLORS[m.label] ?? colors.muted },
              ]}
            />
            <Text style={styles.macroValue}>
              {m.target}
              {m.unit}
            </Text>
            <Text style={styles.macroLabel}>{m.label}</Text>
          </View>
        ))}
      </View>

      {!!card.insight && (
        <View style={styles.insightRow}>
          <Text style={styles.insightText}>{card.insight}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    gap: 16,
    marginTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(200,241,53,0.08)",
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 0.2,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  insightRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 14,
  },
  insightText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  ringWrap: {
    alignItems: "center",
  },
  ringValue: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.text,
  },
  ringLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.muted,
    marginTop: 2,
  },
  macrosRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 20,
  },
  macroCol: {
    alignItems: "center",
    gap: 6,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  macroLabel: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
  },
  macroValue: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
});
