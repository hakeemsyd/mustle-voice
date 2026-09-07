import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { TrophyIcon } from "../icons";
import type { TopLiftsCard as TopLiftsCardData } from "../lib/brain";

interface TopLiftsCardProps {
  card: TopLiftsCardData;
  variant?: "dark" | "light";
}

export function TopLiftsCard({ card, variant = "dark" }: TopLiftsCardProps) {
  const isLight = variant === "light";

  return (
    <View style={[styles.card, isLight && styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isLight && styles.headerIconLight]}>
          <TrophyIcon size={18} color={isLight ? colors.accentOn : colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, isLight && styles.titleLight]}>TOP LIFTS</Text>
          <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>Best lifts · Personalized by MUSTLE</Text>
        </View>
      </View>

      {card.lifts.length === 0 ? (
        <Text style={[styles.emptyText, isLight && styles.emptyTextLight]}>
          Log a few more sessions and your strongest lifts will show up here.
        </Text>
      ) : (
        <>
          <View style={styles.lifts}>
            {card.lifts.map((lift, i) => (
              <View
                key={lift.name}
                style={[styles.liftRow, isLight && styles.liftRowLight, i === 0 && styles.liftRowFirst]}
              >
                <Text style={[styles.liftIndex, isLight && styles.liftIndexLight]}>
                  {String(i + 1).padStart(2, "0")}
                </Text>
                <Text style={[styles.liftName, isLight && styles.liftNameLight]}>{lift.name}</Text>
                <Text style={[styles.liftWeight, isLight && styles.liftWeightLight]}>{lift.top_weight_lb} lb</Text>
              </View>
            ))}
          </View>
          {!!card.insight && (
            <View style={[styles.insightRow, isLight && styles.insightRowLight]}>
              <Text style={[styles.insightText, isLight && styles.insightTextLight]}>{card.insight}</Text>
            </View>
          )}
        </>
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
    gap: 14,
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
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
  },
  emptyTextLight: {
    color: lightCard.muted,
  },
  insightRow: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 14,
    marginTop: 2,
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
  lifts: {
    gap: 2,
  },
  liftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  liftRowLight: {
    borderTopColor: lightCard.dividerBg,
  },
  liftRowFirst: {
    borderTopWidth: 0,
    paddingTop: 2,
  },
  liftIndex: {
    width: 18,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.muted,
  },
  liftIndexLight: {
    color: lightCard.muted,
  },
  liftName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  liftNameLight: {
    color: lightCard.text,
  },
  liftWeight: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.accent,
  },
  liftWeightLight: {
    color: lightCard.pillText,
  },
});
