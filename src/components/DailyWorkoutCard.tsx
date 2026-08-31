import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { ClockIcon, DumbbellIcon } from "../icons";
import type { DailyWorkoutCard as DailyWorkoutCardData } from "../lib/brain";

interface DailyWorkoutCardProps {
  card: DailyWorkoutCardData;
  onStartSession: (planSessionId: string) => void;
}

export function DailyWorkoutCard({ card, onStartSession }: DailyWorkoutCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <DumbbellIcon size={18} color={colors.accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{card.day_label}</Text>
          <View style={styles.subtitleRow}>
            <ClockIcon size={11} color={colors.muted} />
            <Text style={styles.subtitle}>
              ~{card.estimated_minutes} min · {card.exercises.length} exercises
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.exercises}>
        {card.exercises.map((ex, i) => (
          <View key={ex.name} style={[styles.exerciseRow, i === 0 && styles.exerciseRowFirst]}>
            <Text style={styles.exerciseIndex}>{String(i + 1).padStart(2, "0")}</Text>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            <Text style={styles.exerciseMeta}>
              {ex.sets} × {ex.reps} · {ex.rest_sec}s rest
            </Text>
          </View>
        ))}
      </View>

      <Pressable style={styles.ctaBtn} onPress={() => onStartSession(card.plan_session_id)}>
        <Text style={styles.ctaBtnText}>Start Session</Text>
      </Pressable>
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
    lineHeight: 22,
    color: colors.text,
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
  exerciseName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  exerciseMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "right",
  },
  ctaBtn: {
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
