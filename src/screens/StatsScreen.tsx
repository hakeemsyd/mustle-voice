import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SvgLineChart } from "../components/SvgLineChart";
import { Sparkline } from "../components/Sparkline";
import { useStatsData } from "../hooks/useStatsData";
import { colors, fonts } from "../constants/theme";
import { FlameIcon, WatchIcon, XIcon } from "../icons";

function DeviceConnectCard({ text }: { text: string }) {
  return (
    <View style={styles.deviceCard}>
      <View style={styles.deviceIconWrap}>
        <WatchIcon size={16} color="rgba(255,255,255,0.4)" />
      </View>
      <Text style={styles.deviceText}>{text}</Text>
      <Text style={styles.deviceCta}>Connect</Text>
    </View>
  );
}

export function StatsScreen() {
  const navigation = useNavigation();
  const {
    loading,
    hasTrainingData,
    performanceScore,
    performanceTrend,
    readinessScore,
    readinessLabel,
    muscleFrequency,
    streakDays,
    weeklyVolumeLb,
    volumeDeltaPct,
    topLifts,
    consistency,
    refetch,
  } = useStatsData();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const maxMuscleFreq = Math.max(1, ...muscleFrequency.map((m) => m.sessions));
  const consDelta = consistency.pct - consistency.prevPct;
  const scoreDelta = performanceTrend.length > 1 ? performanceTrend[performanceTrend.length - 1] - performanceTrend[0] : 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>STATS</Text>
        <Pressable style={styles.closeBtn} onPress={() => navigation.navigate("Home" as never)} hitSlop={8}>
          <XIcon size={18} color="rgba(255,255,255,0.3)" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !hasTrainingData ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>Log a few workouts and your stats will show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroScore}>{performanceScore}</Text>
                <Text style={styles.heroScoreLabel}>PERFORMANCE SCORE</Text>
              </View>
              <Text style={[styles.heroDelta, scoreDelta < 0 && styles.heroDeltaNegative]}>
                {scoreDelta >= 0 ? "+" : ""}
                {scoreDelta} vs last week
              </Text>
            </View>
            <SvgLineChart
              values={performanceTrend}
              height={130}
              showAverage
              labels={performanceTrend.map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (performanceTrend.length - 1 - i));
                return "SMTWTFS"[d.getDay()];
              })}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>IDENTITY SCORE</Text>
            <View style={styles.card}>
              <View style={styles.readinessRow}>
                <Text style={styles.readinessScore}>{readinessScore}</Text>
                <View>
                  <Text style={styles.readinessLabel}>{readinessLabel}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.subLabel}>ENRICHED BY SMART SCALE · BODY COMPOSITION</Text>
            <DeviceConnectCard text="Connect a smart scale to see weight trend, body fat % & lean mass." />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>WEEKLY MOMENTUM</Text>
            <View style={styles.weekCell}>
              <Text style={styles.weekCellLabel}>STREAK</Text>
              <View style={styles.weekCellValueRow}>
                <Text style={styles.weekCellNum}>{streakDays}</Text>
                <Text style={styles.weekCellUnit}>days</Text>
              </View>
              <Text style={styles.weekCellSub}>in a row</Text>
              <View style={styles.streakIconWrap}>
                <FlameIcon size={13} color="rgba(255,160,60,0.9)" />
              </View>
            </View>

            {muscleFrequency.length > 0 && (
              <View style={styles.card}>
                <Text style={[styles.sectionLabel, styles.muscleFreqLabelHeading]}>WORKOUT FREQUENCY BY MUSCLE GROUP</Text>
                <View style={styles.muscleFreqList}>
                  {muscleFrequency.map((m) => (
                    <View key={m.group} style={styles.muscleFreqRow}>
                      <Text style={styles.muscleFreqLabel}>{m.group}</Text>
                      <View style={styles.muscleFreqBarTrack}>
                        <View style={[styles.muscleFreqBarFill, { width: `${(m.sessions / maxMuscleFreq) * 100}%` }]} />
                      </View>
                      <Text style={styles.muscleFreqCount}>{m.sessions}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>STRENGTH TRAJECTORY</Text>
            {topLifts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyCardText}>Log a few strength sessions to see your top lifts trend.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                {topLifts.map((lift, i) => (
                  <View key={lift.name}>
                    {i > 0 && <View style={styles.metricDivider} />}
                    <View style={styles.liftRow}>
                      <View style={styles.liftLeft}>
                        <Text style={styles.liftName} numberOfLines={1}>
                          {lift.name}
                        </Text>
                      </View>
                      <Sparkline values={lift.trend} />
                      <View style={styles.liftWeightWrap}>
                        <Text style={styles.liftWeight}>{lift.topWeightLb}</Text>
                        <Text style={styles.liftUnit}>lb</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.weekCell}>
              <Text style={styles.weekCellLabel}>TOTAL VOLUME</Text>
              <View style={styles.weekCellValueRow}>
                <Text style={styles.weekCellNum}>{weeklyVolumeLb.toLocaleString()}</Text>
                <Text style={styles.weekCellUnit}>lb</Text>
              </View>
              <Text style={styles.weekCellSub}>weight × reps · this week</Text>
              {volumeDeltaPct != null && (
                <Text style={[styles.weekCellDelta, volumeDeltaPct < 0 && styles.weekCellDeltaNegative]}>
                  {volumeDeltaPct >= 0 ? "+" : ""}
                  {volumeDeltaPct}% vs last wk
                </Text>
              )}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PROGRAM ADHERENCE</Text>
            <View style={styles.card}>
              <View style={styles.consistencyTop}>
                <View>
                  <Text style={styles.consistencyBig}>
                    {consistency.completed}/{consistency.planned || "—"}
                  </Text>
                  <Text style={styles.consistencyUnit}>sessions this week</Text>
                </View>
                <View style={styles.consistencyRight}>
                  <Text style={styles.consistencyPct}>{consistency.pct}%</Text>
                  <Text style={[styles.consDelta, consDelta < 0 && styles.consDeltaNegative]}>
                    {consDelta >= 0 ? "+" : ""}
                    {consDelta}% vs last wk
                  </Text>
                </View>
              </View>
              <View style={styles.dayGrid}>
                {consistency.days.map((d, i) => (
                  <View
                    key={i}
                    style={[
                      styles.daySquare,
                      d.status === "completed" && styles.daySquareCompleted,
                      d.status === "missed" && styles.daySquareMissed,
                      d.status === "rest" && styles.daySquareRest,
                    ]}
                  >
                    <Text
                      style={[
                        styles.daySquareText,
                        d.status === "completed" && styles.daySquareTextCompleted,
                        d.status === "missed" && styles.daySquareTextMissed,
                      ]}
                    >
                      {d.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  centerFill: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    height: 48,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(200,241,53,0.1)",
  },
  headerTitle: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 1.32, color: colors.text },
  closeBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center", borderRadius: 16 },

  content: { paddingHorizontal: 22, paddingBottom: 32 },

  hero: { paddingTop: 22 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  heroScore: { fontFamily: fonts.display, fontSize: 80, lineHeight: 76, letterSpacing: -0.8, color: colors.text },
  heroScoreLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    marginTop: 6,
  },
  heroDelta: { fontFamily: fonts.bodyMedium, fontSize: 12, letterSpacing: 0.24, marginTop: 12, color: colors.accent },
  heroDeltaNegative: { color: "rgba(255,80,80,0.8)" },

  section: { gap: 10, paddingTop: 24 },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
  },
  subLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.5)",
    marginTop: 4,
  },

  card: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  muscleFreqLabelHeading: { marginBottom: 2 },

  readinessRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  readinessScore: { fontFamily: fonts.display, fontSize: 34, letterSpacing: 0.68, color: colors.accent },
  readinessLabel: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: "rgba(255,255,255,0.85)" },

  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  deviceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  deviceText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16.8, color: "rgba(255,255,255,0.4)" },
  deviceCta: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.24, color: colors.accent },

  emptyCard: { backgroundColor: "rgba(255,255,255,0.02)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 },
  emptyCardText: { fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.3)", lineHeight: 20 },

  weekCell: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 2,
  },
  weekCellLabel: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.08, color: "rgba(255,255,255,0.45)" },
  weekCellValueRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 4 },
  weekCellNum: { fontFamily: fonts.display, fontSize: 36, letterSpacing: 0.72, color: colors.text },
  weekCellUnit: { fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.4)" },
  weekCellSub: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.1, color: "rgba(255,255,255,0.4)" },
  weekCellDelta: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.11, color: colors.accent, marginTop: 3 },
  weekCellDeltaNegative: { color: "rgba(255,80,80,0.8)" },
  streakIconWrap: { marginTop: 3, alignSelf: "flex-start" },

  muscleFreqList: { gap: 9 },
  muscleFreqRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  muscleFreqLabel: { width: 68, fontFamily: fonts.bodyMedium, fontSize: 11, color: "rgba(255,255,255,0.6)" },
  muscleFreqBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.05)", overflow: "hidden" },
  muscleFreqBarFill: { height: "100%", borderRadius: 4, backgroundColor: colors.accent },
  muscleFreqCount: { width: 20, textAlign: "right", fontFamily: fonts.display, fontSize: 14, color: "rgba(255,255,255,0.7)" },

  metricDivider: { height: 1, backgroundColor: "rgba(255,255,255,0.05)" },
  liftRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  liftLeft: { flex: 1, gap: 2 },
  liftName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: "rgba(255,255,255,0.8)" },
  liftWeightWrap: { flexDirection: "row", alignItems: "baseline", gap: 3 },
  liftWeight: { fontFamily: fonts.display, fontSize: 22, letterSpacing: 0.44, color: colors.text },
  liftUnit: { fontFamily: fonts.body, fontSize: 9, color: "rgba(255,255,255,0.3)" },

  consistencyTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  consistencyBig: { fontFamily: fonts.display, fontSize: 38, letterSpacing: 0.76, color: colors.text },
  consistencyUnit: { fontFamily: fonts.body, fontSize: 10, letterSpacing: 0.4, color: "rgba(255,255,255,0.35)", marginTop: 3 },
  consistencyRight: { alignItems: "flex-end", gap: 3 },
  consistencyPct: { fontFamily: fonts.display, fontSize: 30, letterSpacing: 0.6, color: colors.accent },
  consDelta: { fontFamily: fonts.bodyMedium, fontSize: 10, letterSpacing: 0.1, color: colors.accent },
  consDeltaNegative: { color: "rgba(255,80,80,0.8)" },

  dayGrid: { flexDirection: "row", gap: 6 },
  daySquare: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  daySquareCompleted: { backgroundColor: colors.accent },
  daySquareMissed: { backgroundColor: "rgba(255,80,80,0.14)", borderWidth: 1, borderColor: "rgba(255,80,80,0.28)" },
  daySquareRest: { backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.1)" },
  daySquareText: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 0.22, color: "rgba(255,255,255,0.2)" },
  daySquareTextCompleted: { color: "#000000" },
  daySquareTextMissed: { color: "rgba(255,80,80,0.65)" },
});
