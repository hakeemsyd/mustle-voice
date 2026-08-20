import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { BottomSheet } from "../components/BottomSheet";
import { MonthGrid } from "../components/MonthGrid";
import { SwitchWorkoutSheet } from "../components/SwitchWorkoutSheet";
import {
  useTodayCalendar,
  useWeekCalendar,
  useMonthCalendar,
  useDayDetail,
  startOfWeek,
} from "../hooks/useCalendarData";
import { addDays, formatWeekRange, localDateKey } from "../lib/calendarDate";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { estimateRestSeconds, formatRestSeconds } from "../lib/restSuggestion";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { colors, fonts } from "../constants/theme";
import {
  ArrowLeftIcon,
  BedDoubleIcon,
  CheckCircleIcon,
  CircleIcon,
  ChevronRightIcon,
  DumbbellIcon,
  HeartPulseIcon,
  MoonIcon,
  PlayIcon,
  SwitchIcon,
  TimerIcon,
  UtensilsIcon,
} from "../icons";
import type { RootStackParamList } from "../navigation/types";

type Scope = "today" | "week" | "month";
type Props = NativeStackScreenProps<RootStackParamList, "Calendar">;

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CalendarScreen({ route, navigation }: Props) {
  const insets = useScreenInsets();
  const [scope, setScope] = useState<Scope>(route.params?.initialScope ?? "today");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const [switchOpen, setSwitchOpen] = useState(false);
  const session = useActiveSessionContext();

  const today = useTodayCalendar();
  const week = useWeekCalendar(weekStart);
  const month = useMonthCalendar(monthDate);
  const detail = useDayDetail(detailDate);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <ArrowLeftIcon size={16} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>

      <View style={styles.scopeToggleRow}>
        <View style={styles.scopeToggle}>
          {(["today", "week", "month"] as Scope[]).map((s) => (
            <Pressable key={s} style={[styles.scopeBtn, scope === s && styles.scopeBtnActive]} onPress={() => setScope(s)}>
              <Text style={[styles.scopeBtnText, scope === s && styles.scopeBtnTextActive]}>{titleCase(s)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {scope === "today" &&
          (today.loading ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.todayWrap}>
              <View style={[styles.todayHero, today.isRestDay ? styles.todayHeroRest : styles.todayHeroActive]}>
                <View style={styles.todayHeroTop}>
                  <Text style={[styles.todayEyebrow, !today.isRestDay && styles.todayEyebrowActive]}>
                    {new Date().toLocaleDateString("en-US", { weekday: "long" })} · Today
                  </Text>
                  <View style={[styles.todayIconBadge, !today.isRestDay && styles.todayIconBadgeActive]}>
                    {today.isRestDay ? (
                      <MoonIcon size={18} color={colors.muted} />
                    ) : (
                      <DumbbellIcon size={18} color={colors.accent} />
                    )}
                  </View>
                </View>
                <Text style={[styles.todayTitle, !today.isRestDay && styles.todayTitleActive]}>
                  {today.isRestDay ? "Rest Day" : titleCase(today.session!.focus)}
                </Text>
                <Text style={[styles.todayDate, !today.isRestDay && styles.todayDateActive]}>
                  {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}
                </Text>

                {!today.isRestDay && (
                  <View style={[styles.todayStatsRow, styles.todayStatsRowActive]}>
                    <View style={styles.todayStat}>
                      <Text style={[styles.todayStatValue, styles.todayStatValueActive]}>
                        {today.session!.exercises.length}
                      </Text>
                      <Text style={[styles.todayStatLabel, styles.todayStatLabelActive]}>Exercises</Text>
                    </View>
                    <View style={[styles.todayStatDivider, styles.todayStatDividerActive]} />
                    <View style={styles.todayStat}>
                      <Text style={[styles.todayStatValue, styles.todayStatValueActive]}>
                        {today.session!.exercises.reduce((sum, ex) => sum + (ex.sets ?? 0), 0)}
                      </Text>
                      <Text style={[styles.todayStatLabel, styles.todayStatLabelActive]}>Total sets</Text>
                    </View>
                    <View style={[styles.todayStatDivider, styles.todayStatDividerActive]} />
                    <View style={styles.todayStat}>
                      <Text style={[styles.todayStatValue, styles.todayStatValueActive]}>Strength</Text>
                      <Text style={[styles.todayStatLabel, styles.todayStatLabelActive]}>Type</Text>
                    </View>
                  </View>
                )}
              </View>

              {today.isRestDay ? (
                <Text style={styles.restCopy}>Focus on recovery today — your next session hits harder for it.</Text>
              ) : (
                <>
                  <View style={styles.todaySection}>
                    <View style={styles.todaySectionHeader}>
                      <DumbbellIcon size={13} color={colors.muted} />
                      <Text style={styles.todaySectionLabel}>Workout</Text>
                    </View>
                    <View style={styles.exerciseList}>
                      {today.session!.exercises.map((ex, i) => (
                        <View key={ex.name + i} style={styles.exerciseRow}>
                          <Text style={styles.exerciseIndex}>{String(i + 1).padStart(2, "0")}</Text>
                          <View style={styles.exerciseMain}>
                            <Text style={styles.exerciseName}>{ex.name}</Text>
                            <View style={styles.exerciseRestRow}>
                              <TimerIcon size={10.5} color={colors.muted} />
                              <Text style={styles.exerciseRest}>{formatRestSeconds(estimateRestSeconds(ex.repScheme))}</Text>
                            </View>
                          </View>
                          <Text style={styles.exerciseSets}>
                            {ex.sets ?? "—"} × {ex.repScheme ?? "—"}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  <Pressable
                    style={styles.startBtn}
                    onPress={() => navigation.navigate("PreWorkoutPreview", { planSessionId: today.session!.planSessionId })}
                  >
                    <PlayIcon size={13} color={colors.accentOn} />
                    <Text style={styles.startBtnText}>Start Session</Text>
                  </Pressable>
                </>
              )}

              <View style={styles.todaySection}>
                <View style={styles.todaySectionHeader}>
                  <BedDoubleIcon size={13} color={colors.muted} />
                  <Text style={styles.todaySectionLabel}>Sleep</Text>
                </View>
                <View style={styles.sleepCard}>
                  <View style={styles.sleepTimes}>
                    <View style={styles.sleepTime}>
                      <Text style={styles.sleepTimeValue}>10:30 PM</Text>
                      <Text style={styles.sleepTimeLabel}>Bedtime</Text>
                    </View>
                    <Text style={styles.sleepArrow}>→</Text>
                    <View style={styles.sleepTime}>
                      <Text style={styles.sleepTimeValue}>{today.isRestDay ? "7:00 AM" : "6:30 AM"}</Text>
                      <Text style={styles.sleepTimeLabel}>Wake</Text>
                    </View>
                  </View>
                  <View style={styles.sleepTarget}>
                    <Text style={styles.sleepTargetValue}>{today.isRestDay ? "8.5h" : "8h"}</Text>
                    <Text style={styles.sleepTargetLabel}>target</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

        {scope === "week" && (
          <>
            <View style={styles.weekNav}>
              <Pressable onPress={() => setWeekStart((d) => addDays(d, -7))} hitSlop={8}>
                <View style={{ transform: [{ rotate: "180deg" }] }}>
                  <ChevronRightIcon size={14} color={colors.muted} />
                </View>
              </Pressable>
              <Text style={styles.weekNavLabel}>{formatWeekRange(weekStart)}</Text>
              <Pressable onPress={() => setWeekStart((d) => addDays(d, 7))} hitSlop={8}>
                <ChevronRightIcon size={14} color={colors.muted} />
              </Pressable>
            </View>

            {week.loading ? (
              <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
            ) : (
              <View style={styles.weekList}>
                {week.days.map((day) => {
                  const isToday = day.dateKey === localDateKey(new Date());
                  const isRest = day.status === "rest" && !day.focus;
                  const isDone = day.status === "completed" || day.status === "partial";
                  return (
                    <Pressable
                      key={day.dateKey}
                      style={[styles.weekRow, isToday && styles.weekRowToday]}
                      onPress={() => setDetailDate(day.dateKey)}
                    >
                      <View style={styles.weekDayBlock}>
                        <Text style={[styles.weekDayLabel, isToday && styles.weekDayTextToday]}>{day.weekdayLabel}</Text>
                        <Text style={[styles.weekDayNum, isToday && styles.weekDayTextToday]}>{day.date.getDate()}</Text>
                      </View>
                      <View style={styles.weekInfo}>
                        <View style={styles.weekInfoTop}>
                          {isRest ? (
                            <MoonIcon size={14} color={colors.muted} />
                          ) : (
                            <DumbbellIcon size={14} color={colors.accent} />
                          )}
                          <Text style={styles.weekFocus}>{day.focus ? titleCase(day.focus) : "Rest day"}</Text>
                        </View>
                      </View>
                      {day.status === "missed" && <CircleIcon size={14} color={colors.muted} />}
                      {isDone && <CheckCircleIcon size={14} color={colors.accent} />}
                      <ChevronRightIcon size={13} color={colors.muted} />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {scope === "month" && (
          <View style={styles.monthWrap}>
            <MonthGrid
              monthDate={monthDate}
              onMonthChange={setMonthDate}
              onSelectDay={setDetailDate}
              dayCellStyle={(cell) => (month.plannedDates.has(cell.key) ? styles.scheduledDay : undefined)}
              renderMarker={(cell) => {
                const logged = month.completedDates.has(cell.key) || month.partialDates.has(cell.key);
                if (logged) return <View style={styles.markerFilled} />;
                if (month.plannedDates.has(cell.key)) return <View style={styles.markerHollow} />;
                return null;
              }}
            />
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={styles.markerFilled} />
                <Text style={styles.legendText}>Logged</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.markerHollow} />
                <Text style={styles.legendText}>Planned</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendSwatch} />
                <Text style={styles.legendText}>Training day</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <BottomSheet visible={!!detailDate} onClose={() => setDetailDate(null)} heightVariant="full">
        {detailDate && detail.loading && (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        )}
        {detailDate && !detail.loading && (
          <ScrollView style={styles.detailScroll} contentContainerStyle={styles.detailBody}>
            {(() => {
              const dateObj = new Date(`${detailDate}T00:00:00`);
              const loggedWorkout = detail.workouts[0] ?? null;
              const doneFocus = loggedWorkout?.focus ?? null;
              const plannedValue = doneFocus ? titleCase(doneFocus) : detail.plannedFocus ? titleCase(detail.plannedFocus) : "No session scheduled";
              const hasPlan = !!doneFocus || !!detail.plannedFocus;
              const showStatusBadge = detail.isPast && hasPlan;
              const isDone = !!loggedWorkout;

              return (
                <>
                  <View style={styles.detailHeader}>
                    <Text style={styles.detailEyebrow}>{detail.isToday ? "Today" : detail.isPast ? "Past" : "Upcoming"}</Text>
                    <Text style={styles.detailTitle}>{dateObj.toLocaleDateString("en-US", { weekday: "long" })}</Text>
                    <Text style={styles.detailDate}>{dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric" })}</Text>
                  </View>

                  {hasPlan && (
                    <View style={styles.plannedCard}>
                      <View style={styles.plannedIconBadge}>
                        {doneFocus || detail.plannedFocus ? (
                          <DumbbellIcon size={16} color={colors.accent} />
                        ) : (
                          <MoonIcon size={16} color={colors.accent} />
                        )}
                      </View>
                      <View style={styles.plannedText}>
                        <Text style={styles.plannedLabel}>Planned</Text>
                        <Text style={styles.plannedValue}>{plannedValue}</Text>
                      </View>
                      {showStatusBadge && (
                        <View style={[styles.statusBadge, isDone ? styles.statusDone : styles.statusMissed]}>
                          {isDone ? (
                            <CheckCircleIcon size={11} color={colors.accent} />
                          ) : (
                            <CircleIcon size={11} color={colors.muted} />
                          )}
                          <Text style={[styles.statusBadgeText, isDone && styles.statusBadgeTextDone]}>
                            {isDone ? "Completed" : "Not logged"}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {detail.isToday && !isDone && detail.plannedFocus && (
                    <View style={styles.todayActions}>
                      <Pressable
                        style={styles.startBtn}
                        onPress={() => {
                          if (!detail.plannedSessionId) return;
                          session.start({ type: "strength", planSessionId: detail.plannedSessionId });
                          setDetailDate(null);
                          navigation.navigate("ActiveSession");
                        }}
                      >
                        <PlayIcon size={13} color={colors.accentOn} />
                        <Text style={styles.startBtnText}>Start Session</Text>
                      </Pressable>
                      <Pressable style={styles.switchWorkoutBtn} onPress={() => setSwitchOpen(true)}>
                        <SwitchIcon size={13} color={colors.muted} />
                        <Text style={styles.switchWorkoutBtnText}>Switch Workout</Text>
                      </Pressable>
                    </View>
                  )}

                  {(loggedWorkout || detail.meals.length > 0 || detail.injuryNotes.length > 0 || detail.macros) && (
                    <View style={styles.factsSection}>
                      {detail.isToday && <Text style={styles.factsSectionLabel}>Logged so far</Text>}

                      {detail.injuryNotes.length > 0 && (
                        <View style={styles.factSection}>
                          <View style={styles.factSectionHeader}>
                            <HeartPulseIcon size={14} color={colors.muted} />
                            <Text style={styles.factSectionLabel}>Injury notes</Text>
                          </View>
                          {detail.injuryNotes.map((n) => (
                            <Text key={n.id} style={styles.detailLine}>
                              {n.summary}
                            </Text>
                          ))}
                        </View>
                      )}

                      {detail.meals.length > 0 && (
                        <View style={styles.factSection}>
                          <View style={styles.factSectionHeader}>
                            <UtensilsIcon size={14} color={colors.muted} />
                            <Text style={styles.factSectionLabel}>Meals logged</Text>
                          </View>
                          {detail.meals.map((m, i) => (
                            <Text key={i} style={styles.detailLine}>
                              {m.description} — {m.calories} kcal
                            </Text>
                          ))}
                        </View>
                      )}

                      {detail.macros && (
                        <View style={styles.factSection}>
                          <View style={styles.factSectionHeader}>
                            <Text style={styles.factSectionLabel}>Macro score</Text>
                          </View>
                          <View style={styles.macroBars}>
                            {(
                              [
                                ["Protein", detail.macros.proteinG, detail.macros.proteinGoalG, colors.accent],
                                ["Carbs", detail.macros.carbsG, detail.macros.carbsGoalG, "#60a5fa"],
                                ["Fat", detail.macros.fatG, detail.macros.fatGoalG, "#fb923c"],
                              ] as const
                            ).map(([label, value, goal, color]) => (
                              <View key={label} style={styles.macroRow}>
                                <View style={styles.macroRowTop}>
                                  <Text style={styles.macroRowLabel}>{label}</Text>
                                  <Text style={styles.macroRowValues}>
                                    {value}
                                    <Text style={styles.macroRowSep}>/</Text>
                                    {goal}g
                                  </Text>
                                </View>
                                <View style={styles.macroRowBar}>
                                  <View
                                    style={[
                                      styles.macroRowFill,
                                      { width: `${goal > 0 ? Math.min(Math.round((value / goal) * 100), 100) : 0}%`, backgroundColor: color },
                                    ]}
                                  />
                                </View>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {loggedWorkout && (
                        <Pressable
                          style={styles.factRow}
                          onPress={() => {
                            setDetailDate(null);
                            navigation.navigate("SessionReport", { workoutLogId: loggedWorkout.workoutLogId });
                          }}
                        >
                          <View style={styles.factSectionHeader}>
                            <DumbbellIcon size={14} color={colors.muted} />
                            <Text style={styles.factSectionLabel}>Workout summary</Text>
                            <View style={styles.factLink}>
                              <Text style={styles.factLinkText}>View report</Text>
                              <ChevronRightIcon size={12} color={colors.muted} />
                            </View>
                          </View>
                          {loggedWorkout.exercisesDone.map((ex, j) => (
                            <Text key={j} style={styles.detailLine}>
                              {ex.name} — {ex.sets}×{ex.reps} @ {ex.load}
                            </Text>
                          ))}
                        </Pressable>
                      )}
                    </View>
                  )}

                  {!hasPlan && !loggedWorkout && detail.meals.length === 0 && detail.injuryNotes.length === 0 && (
                    <Text style={styles.detailEmpty}>Nothing logged this day.</Text>
                  )}
                </>
              );
            })()}
          </ScrollView>
        )}
      </BottomSheet>

      <SwitchWorkoutSheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        currentPlanSessionId={detail.plannedSessionId ?? undefined}
        confirmDescription={`This replaces ${detail.plannedFocus ? titleCase(detail.plannedFocus) : "today's session"} with a different type — nothing's been logged yet, so nothing is lost.`}
        onConfirm={(target) => {
          setSwitchOpen(false);
          session.start({ ...target, switchedFromSessionId: detail.plannedSessionId ?? undefined });
          setDetailDate(null);
          navigation.navigate("ActiveSession");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },

  scopeToggleRow: { paddingHorizontal: 20, paddingTop: 16 },
  scopeToggle: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
    padding: 3,
    gap: 4,
  },
  scopeBtn: { paddingVertical: 5, paddingHorizontal: 13, borderRadius: 100 },
  scopeBtnActive: { backgroundColor: colors.border },
  scopeBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 11.5, color: colors.muted },
  scopeBtnTextActive: { color: colors.text },

  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },

  todayHero: { borderRadius: 20, padding: 20, backgroundColor: colors.surfaceDeep, borderWidth: 1, borderColor: colors.border },
  todayHeroRest: { backgroundColor: colors.surface },
  todayHeroActive: { backgroundColor: colors.accent, borderColor: "transparent" },
  todayHeroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  todayEyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  todayEyebrowActive: { color: "rgba(8,8,8,0.62)" },
  todayIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  todayIconBadgeActive: { backgroundColor: "rgba(8,8,8,0.88)", borderColor: "transparent" },
  todayTitle: { fontFamily: fonts.display, fontSize: 34, color: colors.text, marginTop: 10, textTransform: "uppercase" },
  todayTitleActive: { color: colors.accentOn },
  todayDate: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 4 },
  todayDateActive: { color: "rgba(8,8,8,0.7)" },
  todayStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  todayStatsRowActive: { borderTopColor: "rgba(8,8,8,0.15)" },
  todayStat: { flex: 1, gap: 2 },
  todayStatValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  todayStatLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.muted },
  todayStatDivider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: 14 },
  todayStatDividerActive: { backgroundColor: "rgba(8,8,8,0.15)" },
  todayStatValueActive: { color: colors.accentOn },
  todayStatLabelActive: { color: "rgba(8,8,8,0.62)" },

  todayWrap: { gap: 20 },

  restCopy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },

  todaySection: { gap: 10 },
  todaySectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  todaySectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },

  exerciseList: { gap: 8 },
  exerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exerciseIndex: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.muted, width: 20 },
  exerciseMain: { flex: 1, gap: 2 },
  exerciseName: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.text },
  exerciseRestRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  exerciseRest: { fontFamily: fonts.body, fontSize: 10.5, color: colors.muted },
  exerciseSets: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.muted },

  sleepCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sleepTimes: { flexDirection: "row", alignItems: "center", gap: 12 },
  sleepTime: { gap: 2 },
  sleepTimeValue: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  sleepTimeLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.muted },
  sleepArrow: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  sleepTarget: { alignItems: "flex-end", gap: 1 },
  sleepTargetValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.accent },
  sleepTargetLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.muted },

  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 100,
    paddingVertical: 14,
    marginTop: 18,
  },
  startBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accentOn },

  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 14 },
  weekNavLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text, minWidth: 110, textAlign: "center" },

  weekList: { gap: 8 },
  weekRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  weekRowToday: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  weekDayBlock: { width: 34, alignItems: "center", gap: 2 },
  weekDayLabel: { fontFamily: fonts.monoBold, fontSize: 9.5, color: colors.muted },
  weekDayNum: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.text },
  weekDayTextToday: { color: colors.accent },
  weekInfo: { flex: 1, gap: 3 },
  weekInfoTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  weekFocus: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },

  monthWrap: {
    gap: 16,
    padding: 18,
    borderRadius: 20,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scheduledDay: { backgroundColor: colors.accentDim, borderColor: colors.accentBorder },
  markerFilled: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.accent },
  markerHollow: { width: 4, height: 4, borderRadius: 2, borderWidth: 1, borderColor: colors.muted },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  legendText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },

  detailScroll: { flex: 1 },
  detailBody: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 18 },

  detailHeader: { gap: 2, paddingBottom: 4 },
  detailEyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.accent,
  },
  detailTitle: { fontFamily: fonts.display, fontSize: 30, color: colors.text, marginTop: 2, textTransform: "uppercase" },
  detailDate: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, marginTop: 2 },

  plannedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 13,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plannedIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  plannedText: { flex: 1, gap: 1 },
  plannedLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", color: colors.muted },
  plannedValue: { fontFamily: fonts.bodySemiBold, fontSize: 13.5, color: colors.text },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 100 },
  statusDone: { backgroundColor: colors.accentDim },
  statusMissed: { backgroundColor: colors.surfaceDeep },
  statusBadgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: colors.muted },
  statusBadgeTextDone: { color: colors.accent },

  todayActions: { gap: 10 },
  switchWorkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 42,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchWorkoutBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.muted },

  factsSection: { gap: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  factsSectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  factRow: { gap: 6 },
  factSection: { gap: 6 },
  factSectionHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  factSectionLabel: {
    flex: 1,
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  factLink: { flexDirection: "row", alignItems: "center", gap: 3 },
  factLinkText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.muted },
  detailEmpty: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, paddingVertical: 12 },
  detailLine: { fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.8)" },

  macroBars: { gap: 10 },
  macroRow: { gap: 5 },
  macroRowTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  macroRowLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.text },
  macroRowValues: { fontFamily: fonts.body, fontSize: 11.5, color: colors.muted },
  macroRowSep: { marginHorizontal: 2 },
  macroRowBar: { height: 5, borderRadius: 3, backgroundColor: colors.surfaceDeep, overflow: "hidden" },
  macroRowFill: { height: "100%", borderRadius: 3 },
});
