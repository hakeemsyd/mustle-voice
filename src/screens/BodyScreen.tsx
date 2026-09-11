import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { BottomSheet } from "../components/BottomSheet";
import { SvgLineChart } from "../components/SvgLineChart";
import { BodyZoneMap, type FlaggedZone } from "../components/BodyZoneMap";
import { FloatingParticles, type ParticleConfig } from "../components/FloatingParticles";
import { HeroGlow } from "../components/HeroGlow";
import { useBodyData } from "../hooks/useBodyData";
import { cmToDisplayHeight, kgToDisplayWeight, kgToDisplayWeightValue } from "../lib/units";
import { colors, fonts } from "../constants/theme";
import {
  InfoIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "../icons";
import { titleCase } from "../lib/textFormat";

const CHECKIN_ICON_COLOR = "rgba(251,180,60,0.85)";

// Reference's Body screen reuses Home's hero CSS classes but seeds them with its own,
// sparser particle set (3 vs Home's 8) — matched verbatim from BodyScreen.tsx's inline array.
const BODY_PARTICLES: ParticleConfig[] = [
  { left: "18%", size: 2, duration: 3600, delay: 0 },
  { left: "48%", size: 3, duration: 4100, delay: 700 },
  { left: "76%", size: 2, duration: 3900, delay: 1400 },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function BodyScreen() {
  const navigation = useNavigation();
  const {
    loading,
    composition,
    latestWeightKg,
    weekDeltaKg,
    hasTrend,
    flaggedZones,
    profile,
    proteinAdherence,
    sourcesSynced,
    unitPrefs,
    refetch,
  } = useBodyData();
  const [compOpen, setCompOpen] = useState(false);
  const [range, setRange] = useState<30 | 90>(30);
  const [detail, setDetail] = useState<FlaggedZone | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  // This tab stays mounted across navigation, so without this a profile field the coach updates
  // (e.g. after "Update with your coach" hands off to Global Chat) wouldn't show up here until
  // the app relaunched — same reasoning as Fuel's identical refetch-on-focus.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const dataInRange = composition.slice(-range);
  const chartValues = dataInRange.map((p) => kgToDisplayWeightValue(p.weightKg, unitPrefs));
  const down = (weekDeltaKg ?? 0) <= 0;
  const latestEntry = composition[composition.length - 1] ?? null;
  const weekDeltaDisplay = weekDeltaKg !== null ? kgToDisplayWeight(Math.abs(weekDeltaKg), unitPrefs) : null;

  const checkin = !hasTrend
    ? {
        icon: <MoonIcon size={20} color={CHECKIN_ICON_COLOR} />,
        greeting: "Body check-in",
        main: "No weigh-ins logged this week.\nTell your coach your weight to start tracking a trend.",
        sub: "Body composition · no data yet",
      }
    : flaggedZones.length > 0
      ? {
          icon: <MoonIcon size={20} color={CHECKIN_ICON_COLOR} />,
          greeting: "Body check-in",
          main: `${down ? "Down" : "Up"} ${weekDeltaDisplay} from last week.\n${flaggedZones[0].label} is still flagged — check in with your coach before pushing that area.`,
          sub: `Body composition · updated ${relativeDay(latestEntry!.date)}`,
        }
      : {
          icon: <SunIcon size={20} color={CHECKIN_ICON_COLOR} />,
          greeting: "Body check-in",
          main: `${down ? "Down" : "Up"} ${weekDeltaDisplay} from last week.\nNothing flagged right now — you're clear to train.`,
          sub: `Body composition · updated ${relativeDay(latestEntry!.date)}`,
        };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>MUSTLE</Text>
      </View>
      <View style={styles.rule} />

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} onScrollBeginDrag={() => refetch()}>
          {/* 1. Coach check-in hero — reuses Home's particle/glow/caption treatment */}
          <View style={styles.hero}>
            <FloatingParticles particles={BODY_PARTICLES} />
            <HeroGlow />
            <View style={styles.heroTop}>
              <View style={styles.captionIconRow}>{checkin.icon}</View>
              <Text style={styles.captionGreeting}>{checkin.greeting}</Text>
              <Text style={styles.captionMain}>{checkin.main}</Text>
              <Text style={styles.captionSub}>{checkin.sub}</Text>
            </View>
          </View>

          <View style={styles.rule} />

          {/* 2. Weekly status hero */}
          <View style={styles.section}>
            <View style={[styles.statusHero, hasTrend && styles.statusHeroActive]}>
              <View style={styles.statusHeroTop}>
                <Text style={[styles.statusEyebrow, hasTrend && styles.statusEyebrowActive]}>THIS WEEK</Text>
                <View style={[styles.statusIconBadge, hasTrend && styles.statusIconBadgeActive]}>
                  {down ? (
                    <TrendingDownIcon size={18} color={colors.accent} />
                  ) : (
                    <TrendingUpIcon size={18} color={colors.accent} />
                  )}
                </View>
              </View>
              <Text style={[styles.statusTitle, hasTrend && styles.statusTitleActive]}>
                {hasTrend ? `${weekDeltaDisplay} ${down ? "down" : "up"}` : "No trend yet"}
              </Text>
              <Text style={[styles.statusSub, hasTrend && styles.statusSubActive]}>
                {hasTrend ? "vs last week" : "Tell your coach your weight to see a weekly trend"}
              </Text>

              {hasTrend && (
                <View style={[styles.statusStatsRow, styles.statusStatsRowActive]}>
                  <View style={styles.statusStat}>
                    <Text style={[styles.statusStatValue, styles.statusStatValueActive]}>
                      {kgToDisplayWeight(latestWeightKg!, unitPrefs)}
                    </Text>
                    <Text style={[styles.statusStatLabel, styles.statusStatLabelActive]}>Current</Text>
                  </View>
                  <View style={[styles.statusStatDivider, styles.statusStatDividerActive]} />
                  <View style={styles.statusStat}>
                    <Text style={[styles.statusStatValue, styles.statusStatValueActive]}>
                      {flaggedZones.length}
                    </Text>
                    <Text style={[styles.statusStatLabel, styles.statusStatLabelActive]}>Flagged areas</Text>
                  </View>
                  <View style={[styles.statusStatDivider, styles.statusStatDividerActive]} />
                  <View style={styles.statusStat}>
                    <Text style={[styles.statusStatValue, styles.statusStatValueActive]}>{sourcesSynced}</Text>
                    <Text style={[styles.statusStatLabel, styles.statusStatLabelActive]}>Sources synced</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          <View style={styles.rule} />

          {/* 3. Body Composition Trend — chip + disclosure panel */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>BODY COMPOSITION</Text>
              <Pressable style={styles.infoBtn} onPress={() => setInfoOpen(true)} hitSlop={8}>
                <InfoIcon size={14} color="rgba(255,255,255,0.35)" />
              </Pressable>
            </View>

            <Pressable style={styles.compChip} onPress={() => setCompOpen((v) => !v)}>
              {latestWeightKg == null ? (
                <Text style={styles.compChipLabel}>No data yet — tell your coach your weight</Text>
              ) : (
                <>
                  <Text style={styles.compChipValue}>{kgToDisplayWeight(latestWeightKg, unitPrefs)}</Text>
                  {hasTrend && (
                    <View style={styles.compChipTrendRow}>
                      {down ? (
                        <TrendingDownIcon size={13} color={colors.accent} />
                      ) : (
                        <TrendingUpIcon size={13} color="rgba(255,255,255,0.5)" />
                      )}
                      <Text style={[styles.compChipTrend, down ? styles.compChipTrendDown : styles.compChipTrendUp]}>
                        {weekDeltaDisplay}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.compChipLabel}>{hasTrend ? "vs last week" : "Log again to see a trend"}</Text>
                </>
              )}
              <Text style={styles.compChipArrow}>{compOpen ? "▲" : "▼"}</Text>
            </Pressable>

            {compOpen && (
              <View style={styles.compPanelInner}>
                {chartValues.length < 2 ? (
                  <View style={styles.stateWrap}>
                    <Text style={styles.stateTitle}>Not enough data yet</Text>
                    <Text style={styles.stateSub}>
                      Log your weight with your coach a couple more times to see a trend line here.
                    </Text>
                  </View>
                ) : (
                  <>
                    {(proteinAdherence || hasTrend) && (
                      <View style={styles.insightGroup}>
                        {hasTrend && (
                          <View style={styles.insightRow}>
                            <SparklesIcon size={14} color={colors.accent} />
                            <Text style={styles.insightText}>
                              <Text style={styles.insightStrong}>
                                {down ? "Down" : "Up"} {weekDeltaDisplay}
                              </Text>{" "}
                              this week
                              {proteinAdherence
                                ? <Text> — and you hit your protein target <Text style={styles.insightStrong}>{proteinAdherence.daysHit}/{proteinAdherence.totalDays}</Text> days.</Text>
                                : "."}
                            </Text>
                          </View>
                        )}
                        {!hasTrend && proteinAdherence && (
                          <View style={styles.insightRow}>
                            <SparklesIcon size={14} color={colors.accent} />
                            <Text style={styles.insightText}>
                              You hit your protein target{" "}
                              <Text style={styles.insightStrong}>
                                {proteinAdherence.daysHit}/{proteinAdherence.totalDays}
                              </Text>{" "}
                              days this week.
                            </Text>
                          </View>
                        )}
                      </View>
                    )}

                    <View style={styles.rangeToggle}>
                      <Pressable style={[styles.rangeBtn, range === 30 && styles.rangeBtnActive]} onPress={() => setRange(30)}>
                        <Text style={[styles.rangeBtnText, range === 30 && styles.rangeBtnTextActive]}>30 DAYS</Text>
                      </Pressable>
                      <Pressable style={[styles.rangeBtn, range === 90 && styles.rangeBtnActive]} onPress={() => setRange(90)}>
                        <Text style={[styles.rangeBtnText, range === 90 && styles.rangeBtnTextActive]}>90 DAYS</Text>
                      </Pressable>
                    </View>

                    <SvgLineChart values={chartValues} height={160} />

                    <View style={styles.chartLegend}>
                      <View style={styles.chartLegendItem}>
                        <View style={[styles.chartLegendSwatch, { backgroundColor: colors.accent }]} />
                        <Text style={styles.chartLegendText}>Weight</Text>
                      </View>
                    </View>

                    <View style={styles.sourceFooter}>
                      <View style={styles.sourceBadge}>
                        <View style={[styles.sourceDot, { backgroundColor: colors.accent }]} />
                        <Text style={styles.sourceBadgeText}>Conversational</Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          <View style={styles.rule} />

          {/* 4. Injury & Recovery Map */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>INJURY & RECOVERY</Text>
            </View>
            <BodyZoneMap flagged={flaggedZones} onSelect={setDetail} />
            {flaggedZones.length > 0 && (
              <View style={styles.flaggedList}>
                {flaggedZones.map((z, i) => (
                  // Two distinct injuries can resolve to the same body zone (e.g. logged
                  // twice at different times) — zoneId alone isn't a unique key here.
                  <Pressable key={`${z.zoneId}-${z.createdAt}-${i}`} style={styles.flaggedRow} onPress={() => setDetail(z)}>
                    <View style={styles.flaggedDot} />
                    <Text style={styles.flaggedLabel}>{z.label}</Text>
                    <Text style={styles.flaggedArrow}>→</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <View style={styles.rule} />

          {/* 5. Profile Summary */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>PROFILE</Text>
            </View>
            <View style={styles.profileCard}>
              {(
                [
                  ["Goal", titleCase(profile.goal)],
                  ["Frequency", profile.daysPerWeek ? `${profile.daysPerWeek}× per week` : "—"],
                  ["Height", profile.heightCm ? cmToDisplayHeight(profile.heightCm, unitPrefs) : "—"],
                  ["Weight", profile.weightKg ? kgToDisplayWeight(profile.weightKg, unitPrefs) : "—"],
                  ["Injuries", profile.injuriesLabel],
                ] as const
              ).map(([k, v], i, arr) => (
                <View key={k} style={[styles.profileRow, i === arr.length - 1 && styles.profileRowLast]}>
                  <Text style={styles.profileRowKey}>{k.toUpperCase()}</Text>
                  <Text style={styles.profileRowVal}>{v}</Text>
                </View>
              ))}
              <Pressable
                style={styles.updateBtn}
                onPress={() =>
                  navigation.navigate("GlobalChat", {
                    autoSendMessage: "I'd like to update something on my profile.",
                  })
                }
              >
                <Text style={styles.updateBtnText}>Update with your coach</Text>
              </Pressable>
            </View>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      <BottomSheet visible={infoOpen} onClose={() => setInfoOpen(false)}>
        <View style={styles.detailBody}>
          <Text style={styles.infoTitle}>How this is calculated</Text>
          <Text style={styles.infoText}>
            Weight comes from whatever you've told your coach directly — we don't have a wearable or smart-scale
            connection yet, so every reading here is conversational.
          </Text>
          <Text style={styles.infoText}>
            The trend badge compares your most recent reading to the one from about 7 days earlier.
          </Text>
        </View>
      </BottomSheet>

      <BottomSheet visible={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <View style={styles.detailBody}>
            <Text style={styles.detailTitle}>{detail.label}</Text>
            <Text style={styles.detailMeta}>Flagged {formatDate(detail.createdAt)}</Text>
            {!!detail.note && <Text style={styles.detailNote}>{detail.note}</Text>}
          </View>
        )}
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
    justifyContent: "space-between",
    paddingHorizontal: 22,
    height: 48,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.accent,
    letterSpacing: 1.6,
  },
  content: { paddingBottom: 24 },

  rule: { height: 1, backgroundColor: colors.accentDim, marginHorizontal: 22 },

  hero: { alignItems: "center", paddingTop: 24, paddingBottom: 8, minHeight: 200, overflow: "hidden" },
  heroTop: { alignItems: "center", gap: 6, paddingHorizontal: 32 },
  captionIconRow: {
    marginBottom: 2,
    shadowColor: "#FBB43C",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  captionGreeting: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  captionMain: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    lineHeight: 27,
    marginTop: 4,
    marginBottom: 2,
    color: "rgba(255,255,255,0.88)",
    textAlign: "center",
  },
  captionSub: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.32)" },

  section: { paddingHorizontal: 22, paddingVertical: 20 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 15,
    letterSpacing: 1.2,
    color: "rgba(255,255,255,0.4)",
  },
  infoBtn: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },

  statusHero: {
    flexDirection: "column",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDeep,
  },
  statusHeroActive: { backgroundColor: colors.accent, borderColor: "transparent" },
  statusHeroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusEyebrow: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.4)",
  },
  statusEyebrowActive: { color: "rgba(8,8,8,0.62)" },
  statusIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  statusIconBadgeActive: { backgroundColor: "rgba(8,8,8,0.88)", borderColor: "transparent" },
  statusTitle: { fontFamily: fonts.display, fontSize: 32, color: colors.text, marginTop: 10 },
  statusTitleActive: { color: colors.accentOn },
  statusSub: { fontFamily: fonts.body, fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 4 },
  statusSubActive: { color: "rgba(8,8,8,0.7)" },
  statusStatsRow: { flexDirection: "row", alignItems: "center", marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  statusStatsRowActive: { borderTopColor: "rgba(8,8,8,0.15)" },
  statusStat: { flex: 1, gap: 2 },
  statusStatValue: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.text },
  statusStatValueActive: { color: colors.accentOn },
  statusStatLabel: { fontFamily: fonts.body, fontSize: 10.5, color: "rgba(255,255,255,0.4)" },
  statusStatLabelActive: { color: "rgba(8,8,8,0.62)" },
  statusStatDivider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: 14 },
  statusStatDividerActive: { backgroundColor: "rgba(8,8,8,0.15)" },

  compChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  compChipValue: { fontFamily: fonts.display, fontSize: 22, color: colors.text },
  compChipTrendRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  compChipTrend: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  compChipTrendDown: { color: colors.accent },
  compChipTrendUp: { color: "rgba(255,255,255,0.5)" },
  compChipLabel: { flex: 1, fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.4)" },
  compChipArrow: { fontSize: 9, color: "rgba(255,255,255,0.3)" },

  compPanelInner: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
  },

  insightGroup: { paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle, gap: 10 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  insightText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18.75, color: "rgba(255,255,255,0.65)" },
  insightStrong: { fontFamily: fonts.bodyBold, color: colors.text },

  rangeToggle: {
    flexDirection: "row",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 3,
    gap: 2,
    marginBottom: 14,
  },
  rangeBtn: { paddingVertical: 5, paddingHorizontal: 16, borderRadius: 5 },
  rangeBtnActive: { backgroundColor: colors.accentDim },
  rangeBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: "rgba(255,255,255,0.35)" },
  rangeBtnTextActive: { color: colors.accent },

  chartLegend: { flexDirection: "row", gap: 16, marginTop: 8 },
  chartLegendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  chartLegendSwatch: { width: 10, height: 2, borderRadius: 1 },
  chartLegendText: { fontFamily: fonts.body, fontSize: 11, color: "rgba(255,255,255,0.45)" },

  sourceFooter: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sourceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  sourceDot: { width: 5, height: 5, borderRadius: 2.5 },
  sourceBadgeText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: "rgba(255,255,255,0.4)" },

  stateWrap: { alignItems: "center", gap: 12, paddingVertical: 28, paddingHorizontal: 10 },
  stateTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: "rgba(255,255,255,0.65)" },
  stateSub: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 18 },

  flaggedList: { gap: 6, marginTop: 12 },
  flaggedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  flaggedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  flaggedLabel: { flex: 1, fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text },
  flaggedArrow: { fontFamily: fonts.body, fontSize: 12, color: "rgba(255,255,255,0.18)" },

  profileCard: { flexDirection: "column" },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  profileRowLast: { borderBottomWidth: 0 },
  profileRowKey: { fontFamily: fonts.display, fontSize: 12, letterSpacing: 0.8, color: "rgba(255,255,255,0.35)", width: 88 },
  profileRowVal: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.text },

  updateBtn: {
    marginTop: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.accentBorderStrong,
    borderRadius: 10,
    paddingVertical: 13,
  },
  updateBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.accent },

  detailBody: { paddingHorizontal: 20, gap: 10 },
  infoTitle: { fontFamily: fonts.display, fontSize: 13, letterSpacing: 0.65, color: colors.text, textTransform: "uppercase" },
  infoText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: "rgba(255,255,255,0.55)" },
  detailTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.text },
  detailMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },
  detailNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20.8,
    color: "rgba(255,255,255,0.65)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accentBorder,
    paddingLeft: 12,
  },
});
