import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { HistoryIcon } from "../icons";
import type { PreviousWorkoutCard as PreviousWorkoutCardData } from "../lib/brain";

interface PreviousWorkoutCardProps {
  card: PreviousWorkoutCardData;
}

const STATUS_LABEL: Record<PreviousWorkoutCardData["status"], string> = {
  completed: "Completed",
  partial: "Partial",
  switched: "Switched",
};

const formatDuration = (totalSec: number | null): string => {
  if (totalSec == null) return "—";
  const min = Math.round(totalSec / 60);
  if (min < 1) return "<1 min";
  return `${min} min`;
};

export const PreviousWorkoutCard = ({ card }: PreviousWorkoutCardProps) => {
  const isDone = card.status === "completed";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <HistoryIcon size={18} color={lightCard.iconOn} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{card.day_label}</Text>
          <View style={styles.subtitleRow}>
            <Text style={styles.subtitle}>Last logged</Text>
            <View style={[styles.statusTag, isDone && styles.statusDone]}>
              <Text style={[styles.statusTagText, isDone && styles.statusTagTextDone]}>
                {STATUS_LABEL[card.status]}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.stats}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>
            {card.total_sets}
            <Text style={styles.statValueOf}>/{card.target_sets}</Text>
          </Text>
          <Text style={styles.statLabel}>Sets</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statTile}>
          <Text style={styles.statValue} numberOfLines={1}>
            {card.top_set_label || "—"}
          </Text>
          <Text style={styles.statLabel}>Top set</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statTile}>
          <Text style={styles.statValue}>{formatDuration(card.duration_sec)}</Text>
          <Text style={styles.statLabel}>Duration</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: lightCard.bg,
    borderWidth: 1,
    borderColor: lightCard.border,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    flexShrink: 0,
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 20,
    letterSpacing: 0.2,
    color: lightCard.text,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: lightCard.muted,
  },
  statusTag: {
    paddingVertical: 1,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: "rgba(10,10,10,0.06)",
  },
  statusDone: {
    backgroundColor: lightCard.pillBg,
  },
  statusTagText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
    letterSpacing: 0.3,
    color: "rgba(10,10,10,0.6)",
  },
  statusTagTextDone: {
    color: lightCard.pillText,
  },
  stats: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: lightCard.surface,
    borderWidth: 1,
    borderColor: lightCard.statsBorder,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 3,
  },
  statDivider: {
    width: 1,
    alignSelf: "center",
    height: 28,
    backgroundColor: lightCard.dividerBg,
    flexShrink: 0,
  },
  statValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: lightCard.text,
    maxWidth: "100%",
  },
  statValueOf: {
    fontFamily: fonts.bodyMedium,
    color: "rgba(10,10,10,0.4)",
  },
  statLabel: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "rgba(10,10,10,0.5)",
  },
});
