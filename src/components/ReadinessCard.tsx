import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { BatteryChargingIcon } from "../icons";
import { ProgressRing } from "./ProgressRing";
import type { ReadinessCard as ReadinessCardData } from "../lib/brain";

interface ReadinessCardProps {
  card: ReadinessCardData;
}

export function ReadinessCard({ card }: ReadinessCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <BatteryChargingIcon size={18} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>READINESS</Text>
          <Text style={styles.subtitle}>Today's recovery check · Personalized by MUSTLE</Text>
        </View>
      </View>

      <View style={styles.ringRow}>
        <ProgressRing size={104} strokeWidth={9} progress={card.score / 100} color={colors.accent}>
          <Text style={styles.ringValue}>{card.score}</Text>
          <Text style={styles.ringLabel}>/ 100</Text>
        </ProgressRing>

        <View style={styles.chipCol}>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{card.label}</Text>
          </View>
          <Text style={styles.trendText}>— {card.trend_label}</Text>
        </View>
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
  ringRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  ringValue: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.text,
  },
  ringLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.muted,
    marginTop: 2,
  },
  chipCol: {
    flex: 1,
    gap: 8,
    alignItems: "flex-start",
  },
  chip: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.accent,
    textAlign: "center",
  },
  trendText: {
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
});
