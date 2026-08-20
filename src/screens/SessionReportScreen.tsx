import React, { useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useSessionReport } from "../hooks/useSessionReport";
import { formatDuration } from "../lib/sessionReport";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { colors, fonts } from "../constants/theme";
import { CheckIcon, CopyIcon, FlameIcon, ShareIcon, XIcon } from "../icons";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "SessionReport">;

export function SessionReportScreen({ route, navigation }: Props) {
  const insets = useScreenInsets();
  const { loading, error, report } = useSessionReport(route.params.workoutLogId);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  // navigate("Tabs") can push a fresh Tabs instance on top of this modal instead of popping
  // back to the existing one — popToTop unwinds the whole stack unambiguously.
  const done = () => navigation.popToTop();

  const handleShare = async () => {
    if (!report) return;
    try {
      await Share.share({ message: `${report.title} · ${report.debrief.summary}` });
    } catch {
      // User cancelled the share sheet — nothing to recover from.
    }
  };

  const handleCopy = async () => {
    if (!report) return;
    await Clipboard.setStringAsync(report.debrief.summary);
    setCopyState("copied");
    setTimeout(() => setCopyState("idle"), 1600);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <View style={styles.headerEyebrowRow}>
          <Text style={styles.headerEyebrow}>SESSION REPORT</Text>
          {report?.isPartial && (
            <View style={styles.partialTag}>
              <Text style={styles.partialTagText}>PARTIAL SESSION</Text>
            </View>
          )}
        </View>
        <Pressable style={styles.closeBtn} onPress={done} hitSlop={8}>
          <XIcon size={16} color={colors.text} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error || !report ? (
        <View style={styles.centerFill}>
          <Text style={styles.muted}>{error ?? "Session not found"}</Text>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreNum}>{report.score.total}</Text>
                <Text style={styles.scoreLabel}>SCORE</Text>
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.heroTitle}>{report.title}</Text>
                <Text style={styles.heroSub}>
                  {report.dateLabel} · {report.timeLabel}
                </Text>
                {report.streakDays > 0 && (
                  <View style={styles.streakPill}>
                    <FlameIcon size={12} color={colors.accent} />
                    <Text style={styles.streakPillText}>
                      {report.streakDays} day{report.streakDays === 1 ? "" : "s"} streak
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <Section label="Coach's Take">
              <Text style={styles.debriefText}>{report.debrief.summary}</Text>
              {report.debrief.whatWorked.length > 0 && (
                <AnalysisRow label="What worked" items={report.debrief.whatWorked} />
              )}
              {report.debrief.whatToFix.length > 0 && (
                <AnalysisRow label="What to fix" items={report.debrief.whatToFix} />
              )}
              {report.debrief.injuryCheck && (
                <AnalysisRow label="Injury check" items={[report.debrief.injuryCheck]} />
              )}
            </Section>

            <Section label="Session Stats">
              <View style={styles.statGrid}>
                <StatChip label="Duration" value={formatDuration(report.durationSec)} />
                {!report.isCardio && (
                  <>
                    <StatChip
                      label="Volume"
                      value={`${report.volume.toLocaleString()} kg`}
                      delta={
                        report.volumeDeltaPct === null
                          ? "First session"
                          : `${report.volumeDeltaPct >= 0 ? "+" : ""}${report.volumeDeltaPct}% vs last`
                      }
                      positive={report.volumeDeltaPct === null ? undefined : report.volumeDeltaPct >= 0}
                    />
                    <StatChip label="Total Sets" value={`${report.totalSets} / ${report.targetSets || "—"}`} />
                    <StatChip label="Top Set" value={report.topSetLabel} />
                  </>
                )}
                <StatChip
                  label="Streak"
                  value={`${report.streakDays} day${report.streakDays === 1 ? "" : "s"}`}
                />
              </View>
            </Section>

            {!report.isCardio && report.setLog.length > 0 && (
              <Section label="Exercise Log">
                <View style={styles.table}>
                  <View style={styles.tableHead}>
                    <Text style={[styles.tableHeadCell, styles.colExercise]}>Exercise</Text>
                    <Text style={[styles.tableHeadCell, styles.colSet]}>Set</Text>
                    <Text style={[styles.tableHeadCell, styles.colValue]}>Weight</Text>
                    <Text style={[styles.tableHeadCell, styles.colValue]}>Reps</Text>
                  </View>
                  {report.setLog.map((row, i) => (
                    <View key={`${row.exerciseName}-${row.setNumber}-${i}`} style={styles.tableRow}>
                      <Text style={[styles.tableCell, styles.colExercise]} numberOfLines={1}>
                        {row.exerciseName}
                      </Text>
                      <Text style={[styles.tableCell, styles.colSet, styles.tableCellMuted]}>{row.setNumber}</Text>
                      <Text style={[styles.tableCell, styles.colValue]}>{row.weight !== null ? `${row.weight} kg` : "—"}</Text>
                      <Text style={[styles.tableCell, styles.colValue]}>{row.reps ?? "—"}</Text>
                    </View>
                  ))}
                </View>
              </Section>
            )}

            {report.debrief.blueprint.length > 0 && (
              <Section label="Next Session Blueprint">
                <View style={styles.blueprintCard}>
                  {report.debrief.blueprint.map((line, i) => (
                    <View key={i} style={styles.blueprintRow}>
                      <Text style={styles.blueprintIndex}>{String(i + 1).padStart(2, "0")}</Text>
                      <Text style={styles.blueprintText}>{line}</Text>
                    </View>
                  ))}
                </View>
              </Section>
            )}

            <Section label="Performance Score">
              <View style={styles.scoreBreakdown}>
                {report.score.components
                  .filter((c) => c.available)
                  .map((c) => (
                    <ScoreBar key={c.label} label={c.label} value={c.value} max={c.max} />
                  ))}
              </View>
            </Section>

            {report.nutrition ? (
              <Section label="Nutrition">
                <View style={styles.nutritionCard}>
                  <NutritionBar label="Calories" value={report.nutrition.caloriesCurrent} target={report.nutrition.caloriesGoal} unit="kcal" />
                  <NutritionBar label="Protein" value={report.nutrition.proteinCurrent} target={report.nutrition.proteinGoal} unit="g" />
                  <NutritionBar label="Carbs" value={report.nutrition.carbsCurrent} target={report.nutrition.carbsGoal} unit="g" />
                </View>
              </Section>
            ) : (
              <Section label="Nutrition">
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    No nutrition targets set yet — tell your coach your goals to see this here.
                  </Text>
                </View>
              </Section>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.actionRow}>
              <Pressable style={styles.actionBtn} onPress={handleShare}>
                <ShareIcon size={15} color={colors.text} />
                <Text style={styles.actionBtnText}>Share</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={handleCopy}>
                {copyState === "copied" ? (
                  <CheckIcon size={15} color={colors.text} />
                ) : (
                  <CopyIcon size={15} color={colors.text} />
                )}
                <Text style={styles.actionBtnText}>{copyState === "copied" ? "Copied" : "Copy"}</Text>
              </Pressable>
            </View>
            <Pressable style={styles.doneBtn} onPress={done}>
              <Text style={styles.doneBtnText}>DONE</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function AnalysisRow({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={styles.analysisRow}>
      <Text style={styles.analysisLabel}>{label}</Text>
      {items.map((item, i) => (
        <Text key={i} style={styles.analysisItem}>
          {"• "}{item}
        </Text>
      ))}
    </View>
  );
}

function StatChip({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta?: string;
  positive?: boolean;
}) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={styles.statChipValue}>{value}</Text>
      {delta && (
        <Text
          style={[
            styles.statChipDelta,
            positive === undefined ? undefined : positive ? styles.deltaPositive : styles.deltaNegative,
          ]}
        >
          {delta}
        </Text>
      )}
    </View>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={styles.scoreBarRow}>
      <Text style={styles.scoreBarLabel}>{label}</Text>
      <View style={styles.scoreBarTrack}>
        <View style={[styles.scoreBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.scoreBarValue}>+{value}</Text>
    </View>
  );
}

function NutritionBar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.max(0, Math.min(100, (value / target) * 100)) : 0;
  return (
    <View style={styles.nutritionRow}>
      <View style={styles.nutritionRowHead}>
        <Text style={styles.nutritionRowLabel}>{label}</Text>
        <Text style={styles.nutritionRowValue}>
          {Math.round(value).toLocaleString()} / {Math.round(target).toLocaleString()} {unit}
        </Text>
      </View>
      <View style={styles.nutritionTrack}>
        <View style={[styles.nutritionFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerEyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerEyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  partialTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  partialTagText: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 0.6,
    color: colors.text,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },

  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 22 },

  hero: { flexDirection: "row", alignItems: "center", gap: 16 },
  scoreBadge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreNum: { fontFamily: fonts.display, fontSize: 28, color: colors.accent, lineHeight: 30 },
  scoreLabel: { fontFamily: fonts.monoBold, fontSize: 8, letterSpacing: 1, color: colors.accent, opacity: 0.75 },
  heroMeta: { flex: 1, gap: 4 },
  heroTitle: { fontFamily: fonts.display, fontSize: 26, color: colors.text, letterSpacing: 0.3 },
  heroSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  streakPillText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.accent },

  section: { gap: 10 },
  sectionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
  },

  debriefText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },

  analysisRow: { gap: 3, marginTop: 4 },
  analysisLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.accent,
    textTransform: "uppercase",
  },
  analysisItem: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 19, color: colors.muted },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statChip: {
    flexBasis: "48%",
    flexGrow: 1,
    gap: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statChipLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  statChipValue: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  statChipDelta: { fontFamily: fonts.bodySemiBold, fontSize: 10.5, color: colors.muted },
  deltaPositive: { color: colors.accent },
  deltaNegative: { color: colors.danger },

  table: { borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  tableHead: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeadCell: {
    fontFamily: fonts.bodyBold,
    fontSize: 9.5,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tableCell: { fontFamily: fonts.body, fontSize: 12.5, color: colors.text },
  tableCellMuted: { color: colors.muted },
  colExercise: { flex: 1.6 },
  colSet: { flex: 0.6 },
  colValue: { flex: 0.8, textAlign: "right" },

  blueprintCard: {
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  blueprintRow: { flexDirection: "row", gap: 10 },
  blueprintIndex: { fontFamily: fonts.display, fontSize: 14, color: colors.accent },
  blueprintText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },

  scoreBreakdown: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  scoreBarLabel: { width: 76, fontFamily: fonts.body, fontSize: 11.5, color: colors.muted },
  scoreBarTrack: { flex: 1, height: 5, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  scoreBarFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
  scoreBarValue: { width: 34, textAlign: "right", fontFamily: fonts.mono, fontSize: 11, color: colors.text },

  nutritionCard: { gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  nutritionRow: { gap: 5 },
  nutritionRowHead: { flexDirection: "row", justifyContent: "space-between" },
  nutritionRowLabel: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.text },
  nutritionRowValue: { fontFamily: fonts.mono, fontSize: 10.5, color: colors.muted },
  nutritionTrack: { height: 5, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  nutritionFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },

  emptyCard: { padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted },

  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12.5, color: colors.text },
  doneBtn: {
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.text,
  },
  doneBtnText: { fontFamily: fonts.display, fontSize: 18, letterSpacing: 0.5, color: colors.bg },
});
