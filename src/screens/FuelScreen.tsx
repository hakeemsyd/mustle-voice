import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useFuelData, type FoodLogEntry } from "../hooks/useFuelData";
import { startOfLocalDay } from "../lib/calendarDate";
import { colors, fonts } from "../constants/theme";
import {
  AppleIcon,
  BeefIcon,
  CalendarIcon,
  ChevronRightIcon,
  DrumstickIcon,
  EggIcon,
  FishIcon,
  MoonIcon,
  SunIcon,
  UtensilsIcon,
} from "../icons";
import { ProgressRing } from "../components/ProgressRing";
import { BottomSheet } from "../components/BottomSheet";
import { MonthGrid } from "../components/MonthGrid";
import type { ComponentType } from "react";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// "Today"/"Yesterday" beat a bare date once the user's browsed back only a day or two — same
// convention as the reference's own formatLoggedDateLabel.
function formatLoggedDateLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return "Today";
  const yesterday = startOfLocalDay(todayKey);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`) {
    return "Yesterday";
  }
  return startOfLocalDay(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Same 4 time-of-day boundaries as the reference's inferMealTypeFromTime — coarse on
// purpose, this build has no workout-timing context to key a "pre/post" bucket off.
type MealBucket = "breakfast" | "lunch" | "snack" | "dinner";

const MEAL_BADGE: Record<
  MealBucket,
  { Icon: ComponentType<{ size?: number; color?: string }>; label: string }
> = {
  breakfast: { Icon: SunIcon, label: "Breakfast" },
  lunch: { Icon: UtensilsIcon, label: "Lunch" },
  snack: { Icon: AppleIcon, label: "Snack" },
  dinner: { Icon: MoonIcon, label: "Dinner" },
};

function inferMealBucket(iso: string): MealBucket {
  const h = new Date(iso).getHours();
  if (h < 11) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

// Same 4-keyword heuristic as the reference's getMealSummaryIcon, minus its
// matchProfile/ingredient-DB fallback — we have no ingredient nutrition
// database in this app, so anything past these 4 checks falls straight to
// UtensilsIcon instead of a protein/carb/veg/fat category icon.
function getMealIcon(
  description: string,
): ComponentType<{ size?: number; color?: string }> {
  const first = description.split(",")[0]?.trim().toLowerCase() ?? "";
  if (/chicken|turkey/.test(first)) return DrumstickIcon;
  if (/fish|salmon|shrimp|tuna/.test(first)) return FishIcon;
  if (/egg/.test(first)) return EggIcon;
  if (/beef|steak|pork/.test(first)) return BeefIcon;
  return UtensilsIcon;
}

function EmptyRing({ text }: { text: string }) {
  return (
    <View style={styles.emptyRingWrap}>
      <Svg width={172} height={172} viewBox="0 0 172 172" opacity={0.6}>
        <Circle
          cx={86}
          cy={86}
          r={72}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={10}
          strokeDasharray="4 6"
          fill="none"
        />
      </Svg>
      <Text style={styles.emptyRingText}>{text}</Text>
    </View>
  );
}

// Fuel is read-only in the UI on purpose: every meal entry is coach-managed (log/correct/remove
// all go through the brain's log_food/update_food/delete_food, which confirm with the user and
// prevent duplicates) — a direct manual delete here bypassed that entirely and was exactly how a
// deletion could desync from what the coach believed was still logged.
export function FuelScreen() {
  const {
    loading,
    macros,
    refetch,
    loggedDate,
    setLoggedDate,
    loggedEntries,
    loggedLoading,
    goToPreviousDay,
    goToNextDay,
    canGoToNextDay,
    todayKey,
  } = useFuelData();
  const [selectedEntry, setSelectedEntry] = useState<FoodLogEntry | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => new Date());

  // This tab stays mounted across navigation, so without this a meal logged via the coach on
  // another screen (Home chat or mid-workout) wouldn't show up here until the app relaunched.
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const proteinMacro = macros?.find((m) => m.key === "protein");
  const carbsMacro = macros?.find((m) => m.key === "carbs");
  const fatMacro = macros?.find((m) => m.key === "fat");
  const caloriesMacro = macros?.find((m) => m.key === "calories");

  const caloriesGoal = caloriesMacro?.goal ?? 0;
  const caloriesCurrent = caloriesMacro?.current ?? 0;
  const ringProgress =
    caloriesGoal > 0 ? Math.min(1, caloriesCurrent / caloriesGoal) : 0;
  const caloriesRemaining = Math.max(
    0,
    Math.round(caloriesGoal - caloriesCurrent),
  );
  const caloriesOver = Math.max(0, Math.round(caloriesCurrent - caloriesGoal));
  const overLimit =
    !!macros && macros.some((m) => m.goal > 0 && m.current > m.goal);
  // The ring now tracks whichever day is being browsed (see useFuelData), not always literally
  // today — name/copy follow that so "log your first meal" doesn't claim to be about today while
  // showing a past day's totals.
  const hasLoggedForDay = caloriesCurrent > 0;
  const isViewingToday = loggedDate === todayKey;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>FUEL</Text>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {!macros ? (
            <EmptyRing text="No nutrition targets yet — tell your coach your goal to get started." />
          ) : !hasLoggedForDay ? (
            <EmptyRing
              text={
                isViewingToday
                  ? "Log your first meal to see today's macros"
                  : "Nothing logged this day"
              }
            />
          ) : (
            <View style={styles.ringSection}>
              <View style={styles.ringWrap}>
                <ProgressRing
                  size={172}
                  strokeWidth={10}
                  progress={ringProgress}
                  color={overLimit ? colors.danger : colors.accent}
                >
                  <Text
                    style={[
                      styles.ringValue,
                      overLimit && styles.ringValueAlert,
                    ]}
                  >
                    {overLimit ? `+${caloriesOver}` : caloriesRemaining}
                  </Text>
                  <Text style={styles.ringLabel}>
                    {overLimit ? "CAL OVER" : "CAL LEFT"}
                  </Text>
                </ProgressRing>
              </View>

              {overLimit && (
                <Text style={styles.overNotice}>
                  {isViewingToday ? "Over today's target" : "Over this day's target"} — logging still works.
                </Text>
              )}

              <View style={styles.statsRow}>
                {[
                  { label: "Protein", macro: proteinMacro },
                  { label: "Carbs", macro: carbsMacro },
                  { label: "Fat", macro: fatMacro },
                ].map(({ label, macro }) => (
                  <View key={label} style={styles.statChip}>
                    <View
                      style={[
                        styles.statDot,
                        { backgroundColor: macro?.color ?? colors.muted },
                      ]}
                    />
                    <Text style={styles.statValue}>
                      {Math.max(
                        0,
                        Math.round((macro?.goal ?? 0) - (macro?.current ?? 0)),
                      )}
                      {macro?.unit ?? "g"}
                    </Text>
                    <Text style={styles.statLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.dateNavRow}>
            <Pressable style={styles.dateNavBtn} onPress={goToPreviousDay} hitSlop={6}>
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <ChevronRightIcon size={16} color={colors.text} />
              </View>
            </Pressable>
            <Pressable style={styles.dateLabelBtn} onPress={() => setDatePickerOpen(true)}>
              <CalendarIcon size={13} color={colors.text} />
              <Text style={styles.dateLabelText}>{formatLoggedDateLabel(loggedDate, todayKey)}</Text>
            </Pressable>
            <Pressable
              style={[styles.dateNavBtn, !canGoToNextDay && styles.dateNavBtnDisabled]}
              onPress={goToNextDay}
              disabled={!canGoToNextDay}
              hitSlop={6}
            >
              <ChevronRightIcon size={16} color={canGoToNextDay ? colors.text : colors.muted} />
            </Pressable>
          </View>

          {loggedLoading ? (
            <ActivityIndicator color={colors.accent} style={styles.tabPanelEmptyText} />
          ) : loggedEntries.length === 0 ? (
            <Text style={[styles.emptyText, styles.tabPanelEmptyText]}>
              {loggedDate === todayKey
                ? "Nothing logged yet — tell your coach what you ate."
                : "No meals logged that day."}
            </Text>
          ) : (
            <View style={styles.logList}>
              {loggedEntries.map((entry) => {
                const badge = MEAL_BADGE[inferMealBucket(entry.at)];
                const MealIcon = getMealIcon(entry.description);
                return (
                  <Pressable
                    key={entry.id}
                    style={styles.logRow}
                    onPress={() => setSelectedEntry(entry)}
                  >
                    <View style={styles.logIconTile}>
                      <MealIcon size={20} color={colors.accent} />
                    </View>
                    <View style={styles.logRowMain}>
                      <Text style={styles.logDescription}>
                        {entry.description}
                      </Text>
                      <View style={styles.logRowType}>
                        <badge.Icon size={11} color={colors.text} />
                        <Text style={styles.logRowTypeText}>{badge.label}</Text>
                      </View>
                      <Text style={styles.logMacros}>
                        {entry.proteinG}g protein · {entry.carbsG}g carbs ·{" "}
                        {entry.fatG}g fat
                      </Text>
                      <Text style={styles.logMeta}>
                        {formatTime(entry.at)} · {entry.calories} kcal
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      <BottomSheet
        visible={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
      >
        {selectedEntry && (
          <View style={styles.detailWrap}>
            <View style={styles.detailHeader}>
              <View style={styles.logIconTile}>
                {(() => {
                  const DetailIcon = getMealIcon(selectedEntry.description);
                  return <DetailIcon size={20} color={colors.accent} />;
                })()}
              </View>
              <View style={styles.detailHeaderText}>
                <Text style={styles.detailEyebrow}>
                  {formatLongDate(selectedEntry.at)}
                </Text>
                <Text style={styles.detailTitle}>
                  {selectedEntry.description}
                </Text>
              </View>
            </View>

            <View style={styles.detailStatsRow}>
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>
                  {selectedEntry.calories}
                </Text>
                <Text style={styles.detailStatLabel}>cal</Text>
              </View>
              <View style={styles.detailStatDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>
                  {selectedEntry.proteinG}g
                </Text>
                <Text style={styles.detailStatLabel}>protein</Text>
              </View>
              <View style={styles.detailStatDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>
                  {selectedEntry.carbsG}g
                </Text>
                <Text style={styles.detailStatLabel}>carbs</Text>
              </View>
              <View style={styles.detailStatDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailStatValue}>
                  {selectedEntry.fatG}g
                </Text>
                <Text style={styles.detailStatLabel}>fat</Text>
              </View>
            </View>
          </View>
        )}
      </BottomSheet>

      <BottomSheet visible={datePickerOpen} onClose={() => setDatePickerOpen(false)}>
        <MonthGrid
          monthDate={pickerMonth}
          onMonthChange={setPickerMonth}
          onSelectDay={(key) => {
            if (key > todayKey) return;
            setLoggedDate(key);
            setDatePickerOpen(false);
          }}
          dayCellStyle={(info) => (info.key === loggedDate ? styles.dayCellSelected : undefined)}
        />
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(200,241,53,0.1)",
  },
  headerTitle: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 1.32,
    color: colors.text,
  },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },

  emptyText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  tabPanelEmptyText: { marginTop: 14 },

  dateNavRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14 },
  dateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateNavBtnDisabled: { opacity: 0.4 },
  dateLabelBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  dateLabelText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text },

  ringSection: { alignItems: "center", gap: 14, paddingVertical: 8 },
  ringWrap: { alignItems: "center" },
  ringValue: { fontFamily: fonts.display, fontSize: 34, color: colors.text },
  ringValueAlert: { color: colors.danger },
  ringLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.muted,
    marginTop: 2,
  },
  overNotice: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.danger,
    textAlign: "center",
  },

  statsRow: { flexDirection: "row", gap: 20, justifyContent: "center" },
  statChip: { alignItems: "center", gap: 2 },
  statDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 2 },
  statValue: { fontFamily: fonts.display, fontSize: 16, color: colors.text },
  statLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.muted },

  emptyRingWrap: { alignItems: "center", gap: 14, paddingVertical: 8 },
  emptyRingText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "center",
    width: 200,
    marginTop: -8,
  },


  logList: { gap: 8, marginTop: 14 },
  logRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  logIconTile: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logRowMain: { flex: 1, gap: 4 },
  logDescription: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.text,
  },
  logRowType: { flexDirection: "row", alignItems: "center", gap: 4 },
  logRowTypeText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.text,
  },
  logMacros: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  logMeta: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: "rgba(255,255,255,0.35)",
  },

  detailWrap: { gap: 18, paddingHorizontal: 4 },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  // The sheet's own close button is absolutely positioned top-right (BottomSheet.tsx) with no
  // layout space reserved for it — a two-line wrapped title ran straight underneath it.
  detailHeaderText: { flex: 1, gap: 4, paddingRight: 36 },
  detailEyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 10.5,
    letterSpacing: 1.05,
    textTransform: "uppercase",
    color: colors.muted,
  },
  detailTitle: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: 0.24,
    color: colors.text,
    lineHeight: 27,
  },
  detailStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailStat: { flex: 1, alignItems: "center", gap: 2 },
  detailStatValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  detailStatLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.muted },
  detailStatDivider: { width: 1, height: 26, backgroundColor: colors.border },

  dayCellSelected: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
});
