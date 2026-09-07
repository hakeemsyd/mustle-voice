import React, { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useIsFocused, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";

import { VoiceOrb } from "../components/VoiceOrb";
import { ActiveWorkoutBanner } from "../components/ActiveWorkoutBanner";
import { AppDrawer } from "../components/AppDrawer";
import { BottomSheet } from "../components/BottomSheet";
import { FloatingParticles } from "../components/FloatingParticles";
import { ChatComposer } from "../components/ChatComposer";
import { HeroGlow } from "../components/HeroGlow";
import { useSharedVoiceSession } from "../session/VoiceSessionProvider";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { useHomeData } from "../hooks/useHomeData";
import { useHomeChat } from "../hooks/useHomeChat";
import { colors, fonts } from "../constants/theme";
import { CalendarIcon, MenuIcon, MoonIcon, SunIcon } from "../icons";
import { getMomentumLine } from "./homeFormat";

type TimeBand = "Morning" | "Afternoon" | "Evening" | "Night";

function getTimeBand(hour: number): TimeBand {
  if (hour < 5) return "Night";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  if (hour < 22) return "Evening";
  return "Night";
}

function getGreeting(band: TimeBand, name: string | null): string {
  return name ? `${band}, ${name}.` : `${band}.`;
}

export function HomeScreen() {
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<{ Home: { openChat?: boolean } }, "Home">>();
  const isFocused = useIsFocused();
  const timeBand = getTimeBand(new Date().getHours());
  const {
    loading,
    userId,
    userName,
    macros,
    todaySession,
    coachMessage,
    streakDays,
    loadError,
    planPending,
    refetch,
  } = useHomeData();
  const { appendLocal } = useHomeChat(userId);
  const activeSession = useActiveSessionContext();
  const { orbState, isActive, toggle, setMessageHandler, setSessionConfig } = useSharedVoiceSession();
  // Home only owns the shared voice conversation's message handler/config when no workout
  // session is running — once one starts, ActiveSessionScreen claims it for the session's whole
  // lifetime (including minimized) so the underlying connection never has two competing
  // registrations, which is what used to force a manual re-tap after starting a session.
  useEffect(() => {
    if (activeSession.target || !isFocused) return;
    // The ElevenLabs SDK hands us the real spoken transcript as the call happens (its own
    // STT/TTS text, independent of our brain) — fold it into the same feed as typed
    // messages so a conversation reads as one thread whether it was spoken or typed.
    setMessageHandler(({ role, text }) => appendLocal(role === "user" ? "user" : "assistant", text));
    setSessionConfig({
      userId,
      dynamicVariables: {
        user_name: userName ?? "there",
        user_id: userId ?? "",
        user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  }, [activeSession.target, isFocused, userId, userName, appendLocal, setMessageHandler, setSessionConfig]);

  const protein = macros?.find((m) => m.key === "protein") ?? null;

  // The ElevenLabs voice agent writes plan/target changes server-side (its own tool
  // calls to the brain function) — Home never sees them mid-call, so pick them up
  // once the session ends rather than leaving the chip/hero stale until next launch.
  const wasVoiceActive = useRef(false);
  useEffect(() => {
    if (wasVoiceActive.current && !isActive) refetch();
    wasVoiceActive.current = isActive;
  }, [isActive, refetch]);

  // Picks up whatever changed off-screen — e.g. a workout just logged in Active Session —
  // whenever Home regains focus, not just after a voice session ends.
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  // The FloatingCoachButton (Stats/Body/Fuel/Recovery) navigates here with this param to open
  // the coach straight away — cleared right after so a later, unrelated focus doesn't reopen it.
  useEffect(() => {
    if (route.params?.openChat) {
      navigation.navigate("GlobalChat", { initialMode: "keyboard" });
      navigation.setParams({ openChat: undefined } as never);
    }
  }, [route.params?.openChat, navigation]);

  const handleSend = () => {
    setDraftText("");
    Keyboard.dismiss();
  };

  const handleOpenHistoryEntry = (messageId: string) => {
    navigation.navigate("GlobalChat", { initialMode: "keyboard", jumpToMessageId: messageId });
  };

  // The orb's own label promises "tap to stop" once a call is live, so it has to actually end it
  // — it used to navigate to Global Chat either way, which left a live conversation running with
  // no way to stop it from here.
  const handleTalk = () => {
    if (isActive) {
      toggle();
      return;
    }
    navigation.navigate("GlobalChat", { initialMode: "mic" });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.brandGroup}>
          <Pressable
            style={styles.menuBtn}
            onPress={() => setDrawerOpen(true)}
            hitSlop={10}
          >
            <MenuIcon size={18} color={colors.muted} />
          </Pressable>
          <Text style={styles.brand}>MUSTLE</Text>
        </View>

        <Pressable
          style={styles.macroChip}
          onPress={() => setNutritionOpen(true)}
        >
          {loading ? null : protein ? (
            <>
              <Text style={styles.macroChipValue}>{protein.current}</Text>
              <Text style={styles.macroChipSep}>/</Text>
              <Text style={styles.macroChipGoal}>{protein.goal}g</Text>
              <Text style={styles.macroChipLabel}>Protein</Text>
            </>
          ) : (
            <Text style={styles.macroChipLabel}>No targets yet</Text>
          )}
          <Text style={styles.macroChipArrow}>▾</Text>
        </Pressable>
      </View>

      <View style={styles.rule} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.hero}>
              <FloatingParticles />
              <HeroGlow />

              <View style={styles.heroTop}>
                <View
                  style={[
                    styles.captionIconRow,
                    { shadowColor: timeBand === "Night" ? "#B4BEFF" : "#FBB43C" },
                  ]}
                >
                  {timeBand === "Night" ? (
                    <MoonIcon size={20} color="rgba(180,190,255,0.85)" />
                  ) : (
                    <SunIcon size={20} color="rgba(251,180,60,0.85)" />
                  )}
                </View>
                <Text style={styles.captionGreeting}>
                  {getGreeting(timeBand, userName)}
                </Text>
                <Text style={styles.captionMain}>
                  {loading ? "Loading your plan…" : coachMessage}
                </Text>
                <Text style={styles.captionSub}>
                  {loading ? "" : getMomentumLine(streakDays)}
                </Text>

                {!loading && (
                  <View style={styles.metaRow}>
                    {loadError ? (
                      <Pressable style={styles.restLine} onPress={refetch}>
                        <View style={styles.restLineDot} />
                        <Text style={styles.restLineText}>
                          {loadError} Tap to retry
                        </Text>
                      </Pressable>
                    ) : todaySession === null && planPending ? (
                      <Pressable style={styles.restLine} onPress={refetch}>
                        <View style={styles.restLineDot} />
                        <Text style={styles.restLineText}>
                          Still setting up your plan — tap to check
                        </Text>
                      </Pressable>
                    ) : todaySession === null ? (
                      <View style={styles.restLine}>
                        <View style={styles.restLineDot} />
                        <Text style={styles.restLineText}>
                          No plan yet — talk to your coach to set one up
                        </Text>
                      </View>
                    ) : todaySession.hasSession ? (
                      <Pressable
                        style={styles.slimSession}
                        onPress={() =>
                          navigation.navigate("PreWorkoutPreview", {
                            planSessionId: todaySession.planSessionId!,
                          })
                        }
                      >
                        <View style={styles.slimSessionDot} />
                        <Text style={styles.slimSessionName}>
                          {todaySession.name}
                        </Text>
                        <Text style={styles.slimSessionTime}>
                          {todaySession.exerciseCountLabel}
                        </Text>
                        <Text style={styles.slimSessionArrow}>→</Text>
                      </Pressable>
                    ) : (
                      <View style={styles.restLine}>
                        <View style={styles.restLineDot} />
                        <Text style={styles.restLineText}>
                          {todaySession.isRestDay
                            ? "Rest day — you chose to skip today"
                            : "Rest day — focus on recovery"}
                        </Text>
                      </View>
                    )}

                    <Pressable
                      style={styles.planPill}
                      onPress={() =>
                        navigation.navigate("Calendar", {
                          initialScope: "today",
                        })
                      }
                    >
                      <CalendarIcon size={12} color={colors.accent} />
                      <Text style={styles.planPillText}>Today's Plan</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              <View style={styles.orbWrap}>
                <Pressable
                  style={styles.orbBtn}
                  onPress={handleTalk}
                  hitSlop={16}
                >
                  <VoiceOrb state={orbState} size={104} />
                </Pressable>
                <Text style={styles.orbHint}>
                  {isActive ? "tap to stop" : "tap to talk"}
                </Text>
              </View>
            </View>
          </TouchableWithoutFeedback>

        <ChatComposer
          value={draftText}
          onChangeText={setDraftText}
          onSend={handleSend}
          onFocus={() => {
            Keyboard.dismiss();
            navigation.navigate("GlobalChat", { initialMode: "keyboard" });
          }}
          focused={composerFocused}
          onFocusChange={setComposerFocused}
          onTalkTap={handleTalk}
        />
      </KeyboardAvoidingView>

      <ActiveWorkoutBanner />

      <BottomSheet
        visible={nutritionOpen}
        onClose={() => setNutritionOpen(false)}
      >
        <View style={styles.macroSheetBody}>
          <Text style={styles.macroPanelTitle}>TODAY'S NUTRITION</Text>
          {!macros ? (
            <Text style={styles.restLineText}>
              No nutrition targets yet — tell your coach your goal to get
              started.
            </Text>
          ) : (
            macros.map((m) => {
              const pct =
                m.goal > 0
                  ? Math.min(Math.round((m.current / m.goal) * 100), 100)
                  : 0;
              const remaining = m.goal - m.current;
              return (
                <View key={m.key} style={styles.macroRow}>
                  <View style={styles.macroRowTop}>
                    <View
                      style={[styles.macroRowDot, { backgroundColor: m.color }]}
                    />
                    <Text style={styles.macroRowLabel}>{m.label}</Text>
                    <View style={styles.macroRowValues}>
                      <Text
                        style={[styles.macroRowCurrent, { color: m.color }]}
                      >
                        {m.current}
                      </Text>
                      <Text style={styles.macroRowSep}>/</Text>
                      <Text style={styles.macroRowGoal}>
                        {m.goal}
                        {m.unit}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.macroRowBar}>
                    <View
                      style={[
                        styles.macroRowFill,
                        { width: `${pct}%`, backgroundColor: m.color },
                      ]}
                    />
                  </View>
                  <Text style={styles.macroRowRemaining}>
                    {remaining}
                    {m.unit} remaining
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </BottomSheet>

      <AppDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenSettings={() => navigation.navigate("Settings")}
        onOpenCalendar={() =>
          navigation.navigate("Calendar", { initialScope: "month" })
        }
        userId={userId}
        onOpenHistoryEntry={handleOpenHistoryEntry}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  flex: {
    flex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    height: 48,
  },

  brandGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  menuBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  brand: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.accent,
    letterSpacing: 1.6,
  },

  macroChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    borderRadius: 100,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  macroChipValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: colors.accent,
  },
  macroChipSep: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.2)",
  },
  macroChipGoal: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.4)",
  },
  macroChipLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: "rgba(255,255,255,0.55)",
    marginLeft: 1,
  },
  macroChipArrow: {
    fontSize: 7,
    color: "rgba(255,255,255,0.2)",
    marginLeft: 1,
  },

  rule: {
    height: 1,
    backgroundColor: colors.accentDim,
    marginHorizontal: 22,
  },

  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 22,
    paddingBottom: 12,
    overflow: "hidden",
  },

  heroTop: {
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 32,
  },

  captionIconRow: {
    marginBottom: 2,
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

  captionSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: "rgba(255,255,255,0.32)",
  },

  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },

  slimSession: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 100,
  },
  slimSessionDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
  },
  slimSessionName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.text,
    textTransform: "uppercase",
  },
  slimSessionTime: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
  },
  slimSessionArrow: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.accent,
    marginLeft: 2,
  },

  restLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  restLineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restLineText: { fontFamily: fonts.body, fontSize: 11, color: colors.muted },

  planPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    borderRadius: 100,
  },
  planPillText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.65)",
  },

  orbWrap: {
    alignItems: "center",
    gap: 22,
    marginTop: "auto",
    marginBottom: "auto",
  },
  orbBtn: { alignItems: "center", justifyContent: "center" },
  orbHint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    color: "rgba(255,255,255,0.2)",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },

  macroSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 16,
  },
  macroPanelTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: "rgba(255,255,255,0.3)",
    marginBottom: 2,
  },
  macroRow: { gap: 6 },
  macroRowTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  macroRowDot: { width: 7, height: 7, borderRadius: 3.5 },
  macroRowLabel: {
    flex: 1,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  macroRowValues: { flexDirection: "row", alignItems: "baseline", gap: 2 },
  macroRowCurrent: { fontFamily: fonts.display, fontSize: 19 },
  macroRowSep: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.22)",
  },
  macroRowGoal: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
  },
  macroRowBar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  macroRowFill: { height: "100%", borderRadius: 2 },
  macroRowRemaining: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: "rgba(255,255,255,0.28)",
  },
});
