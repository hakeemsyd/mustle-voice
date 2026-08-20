import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../constants/theme";
import { CalendarIcon, CheckIcon } from "../icons";
import type { PlanBreakdownCard as PlanBreakdownCardData } from "../lib/brain";

interface PlanBreakdownCardProps {
  card: PlanBreakdownCardData;
  onStartDay: (planSessionId: string) => void;
  onModify: () => void;
}

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PlanBreakdownCard({ card, onStartDay, onModify }: PlanBreakdownCardProps) {
  const firstDay = card.days[0];

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <CalendarIcon size={16} color={colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>YOUR TRAINING PLAN</Text>
          <Text style={styles.subtitle}>
            {card.days_per_week} training days · {titleCase(card.split)} · Personalized by MUSTLE
          </Text>
        </View>
      </View>

      {card.days.map((day, i) => (
        <View key={day.plan_session_id} style={[styles.dayRow, i === card.days.length - 1 && styles.dayRowLast]}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeText}>DAY {i + 1}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.dayFocus}>{titleCase(day.focus)}</Text>
            <Text style={styles.dayExercises}>{day.exercises.map(titleCase).join(" · ")}</Text>
          </View>
        </View>
      ))}

      <View style={styles.adaptNote}>
        <CheckIcon size={12} color={colors.muted} />
        <Text style={styles.adaptNoteText}>MUSTLE adjusts load, reps, and substitutions as you train.</Text>
      </View>

      <View style={styles.actions}>
        {firstDay && (
          <Pressable style={styles.primaryBtn} onPress={() => onStartDay(firstDay.plan_session_id)}>
            <Text style={styles.primaryBtnText}>START DAY 1</Text>
          </Pressable>
        )}
        <Pressable style={styles.secondaryBtn} onPress={onModify}>
          <Text style={styles.secondaryBtnText}>ADJUST WITH MUSTLE</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    marginTop: 6,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 0.5,
    color: colors.accent,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  dayRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  dayBadge: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dayBadgeText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.accent,
  },
  dayFocus: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  dayExercises: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  adaptNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  adaptNoteText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.accentOn,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.accent,
  },
});
