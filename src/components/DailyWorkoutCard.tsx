import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { ClockIcon, DumbbellIcon, PlayIcon } from "../icons";
import type { DailyWorkoutCard as DailyWorkoutCardData } from "../lib/brain";

interface DailyWorkoutCardProps {
  card: DailyWorkoutCardData;
  onStartSession: (planSessionId: string) => void;
  variant?: "dark" | "light";
}

export const DailyWorkoutCard = ({ card, onStartSession, variant = "dark" }: DailyWorkoutCardProps) => {
  const isLight = variant === "light";

  return (
    <View style={[styles.card, isLight && styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isLight && styles.headerIconLight]}>
          <DumbbellIcon size={18} color={isLight ? lightCard.iconOn : colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.title, isLight && styles.titleLight]}>{card.day_label}</Text>
          <View style={styles.subtitleRow}>
            <ClockIcon size={11} color={isLight ? lightCard.muted : colors.muted} />
            <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>
              ~{card.estimated_minutes} min · {card.exercises.length} exercises
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.exercises}>
        {card.exercises.map((ex, i) => (
          <View
            key={ex.name}
            style={[styles.exerciseRow, isLight && styles.exerciseRowLight, i === 0 && styles.exerciseRowFirst]}
          >
            <Text style={[styles.exerciseIndex, isLight && styles.exerciseIndexLight]}>
              {String(i + 1).padStart(2, "0")}
            </Text>
            <Text style={[styles.exerciseName, isLight && styles.exerciseNameLight]}>{ex.name}</Text>
            <Text style={[styles.exerciseMeta, isLight && styles.exerciseMetaLight]}>
              {ex.sets} × {ex.reps} · {ex.rest_sec}s rest
            </Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.ctaBtn} onPress={() => onStartSession(card.plan_session_id)}>
        <PlayIcon size={13} color={colors.accentOn} />
        <Text style={styles.ctaBtnText}>Start Session</Text>
      </Pressable>
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
    lineHeight: 22,
    color: colors.text,
  },
  titleLight: {
    color: lightCard.text,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  subtitleLight: {
    color: lightCard.muted,
  },
  exercises: {
    gap: 2,
  },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.05)",
  },
  exerciseRowLight: {
    borderTopColor: lightCard.dividerBg,
  },
  exerciseRowFirst: {
    borderTopWidth: 0,
    paddingTop: 2,
  },
  exerciseIndex: {
    width: 18,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.muted,
  },
  exerciseIndexLight: {
    color: lightCard.muted,
  },
  exerciseName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  exerciseNameLight: {
    color: lightCard.text,
  },
  exerciseMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "right",
  },
  exerciseMetaLight: {
    color: lightCard.muted,
  },
  ctaBtn: {
    flexDirection: "row",
    gap: 6,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  ctaBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: colors.accentOn,
  },
});
