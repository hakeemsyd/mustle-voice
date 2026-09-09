import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { CalendarIcon, ChevronRightIcon, DumbbellIcon } from "../icons";
import { titleCase } from "../lib/textFormat";
import type { PlanBreakdownCard as PlanBreakdownCardData } from "../lib/brain";

interface PlanBreakdownCardProps {
  card: PlanBreakdownCardData;
  onStartDay: (planSessionId: string) => void;
  onModify: () => void;
  onOpenPreview?: (planSessionId: string) => void;
  variant?: "dark" | "light";
}

export const PlanBreakdownCard = ({ card, onStartDay, onModify, onOpenPreview, variant = "dark" }: PlanBreakdownCardProps) => {
  const firstDay = card.days[0];
  const isLight = variant === "light";

  return (
    <View style={[styles.card, isLight && styles.cardLight]}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isLight && styles.headerIconLight]}>
          <CalendarIcon size={16} color={isLight ? lightCard.iconOn : colors.accent} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, isLight && styles.titleLight]}>Your Week's Plan</Text>
          <Text style={[styles.subtitle, isLight && styles.subtitleLight]}>
            {card.days_per_week} training days · {titleCase(card.split)} · Personalized by MUSTLE
          </Text>
        </View>
      </View>

      <View style={styles.days}>
        {card.days.map((day, i) => (
          <Pressable
            key={day.plan_session_id}
            style={[styles.dayRow, isLight && styles.dayRowLight]}
            onPress={onOpenPreview ? () => onOpenPreview(day.plan_session_id) : undefined}
          >
            <View style={[styles.dayBadge, isLight && styles.dayBadgeLight]}>
              <Text style={[styles.dayBadgeText, isLight && styles.dayBadgeTextLight]}>DAY {i + 1}</Text>
            </View>
            <View style={[styles.dayIcon, isLight && styles.dayIconLight]}>
              <DumbbellIcon size={13} color={isLight ? lightCard.text : colors.text} />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.dayFocus, isLight && styles.dayFocusLight]}>{titleCase(day.focus)}</Text>
              <Text style={[styles.dayExercises, isLight && styles.dayExercisesLight]}>
                {day.exercises.map(titleCase).join(" · ")}
              </Text>
            </View>
            <ChevronRightIcon
              size={16}
              color={isLight ? "rgba(10,10,10,0.35)" : colors.muted}
            />
          </Pressable>
        ))}
      </View>

      <View style={[styles.adaptNote, isLight && styles.adaptNoteLight]}>
        <Text style={[styles.adaptNoteText, isLight && styles.adaptNoteTextLight]}>
          Rest days aren't shown here — recovery stays built into the week, and the plan adjusts
          automatically based on how you're feeling.
        </Text>
      </View>

      <View style={styles.actions}>
        {firstDay && (
          <Pressable style={styles.primaryBtn} onPress={() => onStartDay(firstDay.plan_session_id)}>
            <Text style={styles.primaryBtnText} numberOfLines={1}>START DAY 1</Text>
          </Pressable>
        )}
        <Pressable style={[styles.secondaryBtn, isLight && styles.secondaryBtnLight]} onPress={onModify}>
          <Text style={[styles.secondaryBtnText, isLight && styles.secondaryBtnTextLight]} numberOfLines={1}>
            ADJUST WITH MUSTLE
          </Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  headerIconLight: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  subtitleLight: {
    color: lightCard.muted,
  },
  days: {
    gap: 8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: 12,
    backgroundColor: colors.surfaceDeep,
  },
  dayRowLight: {
    backgroundColor: lightCard.surface,
    borderColor: lightCard.border,
  },
  dayBadge: {
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  dayIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dayIconLight: {
    backgroundColor: "rgba(10,10,10,0.04)",
    borderColor: lightCard.border,
  },
  dayBadgeLight: {
    borderColor: "transparent",
    backgroundColor: lightCard.pillBg,
  },
  dayBadgeText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.accent,
  },
  dayBadgeTextLight: {
    color: lightCard.pillText,
  },
  dayFocus: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.text,
  },
  dayFocusLight: {
    color: lightCard.text,
  },
  dayExercises: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  dayExercisesLight: {
    color: lightCard.muted,
  },
  adaptNote: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 2,
  },
  adaptNoteLight: {
    borderTopColor: lightCard.dividerBg,
  },
  adaptNoteText: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 19,
    color: colors.muted,
  },
  adaptNoteTextLight: {
    color: lightCard.muted,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    height: 40,
    backgroundColor: colors.accent,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.accentOn,
  },
  secondaryBtn: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnLight: {
    borderColor: "rgba(10,10,10,0.15)",
  },
  secondaryBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.accent,
  },
  secondaryBtnTextLight: {
    color: lightCard.text,
  },
});
