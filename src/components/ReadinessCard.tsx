import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { BatteryChargingIcon } from "../icons";
import { ProgressRing } from "./ProgressRing";
import type { ReadinessCard as ReadinessCardData } from "../lib/brain";

interface ReadinessCardProps {
  card: ReadinessCardData;
  variant?: "dark" | "light";
}

export function ReadinessCard({ card, variant = "dark" }: ReadinessCardProps) {
  const isLight = variant === "light";

  return (
    <View style={[styles.card, isLight && styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isLight && styles.headerIconLight]}>
          <BatteryChargingIcon size={18} color={isLight ? colors.accentOn : colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, isLight && styles.titleLight]}>READINESS</Text>
          <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>
            Today's recovery check · Personalized by MUSTLE
          </Text>
        </View>
      </View>

      <View style={styles.ringRow}>
        <ProgressRing size={104} strokeWidth={9} progress={card.score / 100} color={colors.accent}>
          <Text style={[styles.ringValue, isLight && styles.ringValueLight]}>{card.score}</Text>
          <Text style={[styles.ringLabel, isLight && styles.ringLabelLight]}>/ 100</Text>
        </ProgressRing>

        <View style={styles.chipCol}>
          <View style={[styles.chip, isLight && styles.chipLight]}>
            <Text style={[styles.chipText, isLight && styles.chipTextLight]}>{card.label}</Text>
          </View>
          <Text style={[styles.trendText, isLight && styles.trendTextLight]}>— {card.trend_label}</Text>
        </View>
      </View>

      {!!card.insight && (
        <View style={[styles.insightRow, isLight && styles.insightRowLight]}>
          <Text style={[styles.insightText, isLight && styles.insightTextLight]}>{card.insight}</Text>
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
  ringValueLight: {
    color: lightCard.text,
  },
  ringLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: colors.muted,
    marginTop: 2,
  },
  ringLabelLight: {
    color: lightCard.muted,
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
  chipLight: {
    backgroundColor: lightCard.pillBg,
    borderColor: "transparent",
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.accent,
    textAlign: "center",
  },
  chipTextLight: {
    color: lightCard.pillText,
  },
  trendText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  trendTextLight: {
    color: lightCard.muted,
  },
  insightRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 14,
  },
  insightRowLight: {
    borderTopColor: lightCard.dividerBg,
  },
  insightText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  insightTextLight: {
    color: lightCard.muted,
  },
});
