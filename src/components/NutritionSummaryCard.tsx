import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { UtensilsIcon } from "../icons";
import { ProgressRing } from "./ProgressRing";
import type { NutritionSummaryCard as NutritionSummaryCardData } from "../lib/brain";

interface NutritionSummaryCardProps {
  card: NutritionSummaryCardData;
  variant?: "dark" | "light";
}

const MACRO_COLORS: Record<string, string> = {
  Protein: colors.chartProtein,
  Carbs: colors.chartCarbs,
  Fat: colors.chartFat,
};

const LIGHT_BAR_COLORS: Record<string, string> = {
  Calories: "rgba(10,10,10,0.75)",
  Protein: "#8fac00",
  Carbs: "#3b82f6",
  Fat: "#f97316",
};

const buildNote = (proteinPct: number): string => {
  if (proteinPct >= 100) return "Protein target hit for today — nice work staying on pace.";
  if (proteinPct >= 70) return "You're on pace for your protein target — keep this going through your next meal.";
  return "Still some room on protein today — a meal with lean protein would close the gap fast.";
};

const MacroBarRow = ({
  label,
  value,
  goal,
  unit,
  color,
}: {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
}) => {
  const pct = Math.min(100, Math.round((value / Math.max(1, goal)) * 100));
  return (
    <View style={barStyles.row}>
      <View style={barStyles.top}>
        <Text style={barStyles.label}>{label}</Text>
        <Text style={barStyles.values}>
          {value.toLocaleString()}
          <Text style={barStyles.sep}> / </Text>
          {goal.toLocaleString()}
          {unit}
        </Text>
      </View>
      <View style={barStyles.track}>
        <View style={[barStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

export const NutritionSummaryCard = ({ card, variant = "dark" }: NutritionSummaryCardProps) => {
  const isLight = variant === "light";

  const consumed = card.calories_target - card.calories_left;
  const progress =
    card.calories_target > 0
      ? Math.max(0, Math.min(1, consumed / card.calories_target))
      : 0;

  const protein = card.macros.find((m) => m.label === "Protein");
  const carbs = card.macros.find((m) => m.label === "Carbs");
  const fat = card.macros.find((m) => m.label === "Fat");
  const proteinConsumed = protein?.current ?? 0;
  const carbsConsumed = carbs?.current ?? 0;
  const fatConsumed = fat?.current ?? 0;
  const proteinPct = protein && protein.target > 0 ? Math.round((proteinConsumed / protein.target) * 100) : 0;

  return (
    <View style={[styles.card, isLight && styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isLight && styles.headerIconLight]}>
          <UtensilsIcon size={18} color={isLight ? lightCard.iconOn : colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, isLight && styles.titleLight]}>TODAY'S FUEL</Text>
          <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>
            Macro summary · Personalized by MUSTLE
          </Text>
        </View>
      </View>

      {isLight ? (
        <View style={barStyles.bars}>
          <MacroBarRow
            label="Calories"
            value={consumed}
            goal={card.calories_target}
            unit=" kcal"
            color={LIGHT_BAR_COLORS.Calories}
          />
          <MacroBarRow
            label="Protein"
            value={proteinConsumed}
            goal={protein?.target ?? 0}
            unit="g"
            color={LIGHT_BAR_COLORS.Protein}
          />
          <MacroBarRow
            label="Carbs"
            value={carbsConsumed}
            goal={carbs?.target ?? 0}
            unit="g"
            color={LIGHT_BAR_COLORS.Carbs}
          />
          <MacroBarRow
            label="Fat"
            value={fatConsumed}
            goal={fat?.target ?? 0}
            unit="g"
            color={LIGHT_BAR_COLORS.Fat}
          />
        </View>
      ) : (
        <>
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
        </>
      )}

      {isLight ? (
        <View style={[styles.insightRow, styles.insightRowLight]}>
          <Text style={[styles.insightText, styles.insightTextLight]}>{buildNote(proteinPct)}</Text>
        </View>
      ) : (
        !!card.insight && (
          <View style={styles.insightRow}>
            <Text style={styles.insightText}>{card.insight}</Text>
          </View>
        )
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginTop: 6,
  },
  cardLight: {
    backgroundColor: lightCard.bg,
    borderColor: lightCard.border,
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
  headerIconLight: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
  titleLight: {
    color: lightCard.text,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  subtitleLight: {
    color: lightCard.muted,
  },
  insightRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 10,
  },
  insightRowLight: {
    borderTopColor: lightCard.dividerBg,
  },
  insightText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: colors.muted,
    textAlign: "center",
  },
  insightTextLight: {
    color: lightCard.muted,
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

const barStyles = StyleSheet.create({
  bars: {
    gap: 12,
    paddingVertical: 2,
  },
  row: {
    gap: 5,
  },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: lightCard.text,
  },
  values: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(10,10,10,0.5)",
  },
  sep: {
    color: "rgba(10,10,10,0.5)",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(10,10,10,0.08)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 3,
  },
});
