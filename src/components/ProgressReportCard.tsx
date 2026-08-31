import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import type { ProgressReportCard as ProgressReportCardData } from "../lib/brain";

interface ProgressReportCardProps {
  card: ProgressReportCardData;
}

export function ProgressReportCard({ card }: ProgressReportCardProps) {
  const maxVal = Math.max(1, ...card.trend);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>WEEKLY PROGRESS</Text>
        <Text style={styles.subtitle}>Performance score · Personalized by MUSTLE</Text>
      </View>

      <View style={styles.scoreRow}>
        <Text style={styles.score}>{card.score}</Text>
        <Text style={styles.deltaLabel}>— {card.delta_label}</Text>
      </View>

      <View style={styles.chart}>
        {card.trend.map((v, i) => {
          const isLast = i === card.trend.length - 1;
          const h = Math.max(4, (v / maxVal) * 56);
          return (
            <View key={i} style={styles.barCol}>
              <View style={[styles.bar, { height: h }, isLast && styles.barActive]} />
              <Text style={[styles.barLabel, isLast && styles.barLabelActive]}>{card.trend_labels[i]}</Text>
            </View>
          );
        })}
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
    gap: 2,
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
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  score: {
    fontFamily: fonts.display,
    fontSize: 40,
    color: colors.text,
  },
  deltaLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.muted,
  },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 78,
  },
  barCol: {
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  bar: {
    width: 14,
    borderRadius: 5,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  barActive: {
    backgroundColor: colors.accent,
  },
  barLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    color: colors.muted,
  },
  barLabelActive: {
    color: colors.text,
  },
});
