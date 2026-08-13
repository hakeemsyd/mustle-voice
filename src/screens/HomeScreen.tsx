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
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useFocusEffect, useNavigation } from "@react-navigation/native";

import { VoiceOrb } from "../components/VoiceOrb";
import { BottomSheet } from "../components/BottomSheet";
import { FloatingParticles } from "../components/FloatingParticles";
import { ChatComposer } from "../components/ChatComposer";
import { ChatTranscript } from "../components/ChatTranscript";
import { HeroGlow } from "../components/HeroGlow";
import { VoiceAmbient } from "../components/VoiceAmbient";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { useHomeData } from "../hooks/useHomeData";
import { useHomeChat } from "../hooks/useHomeChat";
import { colors, fonts } from "../constants/theme";
import { AudioLinesIcon, CalendarIcon, MenuIcon, MoonIcon, SunIcon, XIcon } from "../icons";
import { getMomentumLine } from "./homeFormat";
import type { OrbState } from "../components/VoiceOrb";

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


// "breathing"/"idle" is the gap between turns — connected but neither side is
// talking — so it reads as the cue for the user to speak, same as the design's
// own fallback copy for that state.
const VOICE_PHASE_LABEL: Record<OrbState, string> = {
  idle: "You speak",
  breathing: "You speak",
  listening: "Listening",
  processing: "Thinking",
  speaking: "Speaking",
};

export function HomeScreen() {
  const [nutritionOpen, setNutritionOpen] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [composerFocused, setComposerFocused] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const navigation = useNavigation();
  const timeBand = getTimeBand(new Date().getHours());
  const { loading, userId, userName, macros, todaySession, coachMessage, streakDays, loadError, refetch } = useHomeData();
  const { transcript, coachTyping, sendMessage, appendLocal } = useHomeChat(userId);
  // The ElevenLabs SDK hands us the real spoken transcript as the call happens (its own
  // STT/TTS text, independent of our brain) — fold it into the same feed as typed
  // messages so a conversation reads as one thread whether it was spoken or typed.
  const { orbState, isActive, toggle } = useVoiceSession(
    ({ role, text }) => appendLocal(role === "user" ? "user" : "assistant", text),
    { userId, dynamicVariables: { user_name: userName ?? "there" } },
  );

  const protein = macros?.find((m) => m.key === "protein") ?? null;

  // The ElevenLabs voice agent writes plan/target changes server-side (its own tool
  // calls to the brain function) — Home never sees them mid-call, so pick them up
  // once the session ends rather than leaving the chip/hero stale until next launch.
  const wasVoiceActive = useRef(false);
  useEffect(() => {
    if (wasVoiceActive.current && !isActive) refetch();
    wasVoiceActive.current = isActive;
  }, [isActive, refetch]);

  // The design hides AppNav entirely while the conversation is open — the overlay
  // owns the full screen below the status bar, tab bar included.
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: chatOpen ? { display: "none" } : undefined });
  }, [chatOpen, navigation]);

  // Picks up whatever changed off-screen — e.g. a workout just logged in Active Session —
  // whenever Home regains focus, not just after a voice session ends.
  useFocusEffect(
    React.useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleSend = () => {
    const text = draftText;
    setDraftText("");
    setChatOpen(true);
    sendMessage(text).then(refetch);
  };

  const handleTalk = () => {
    setChatOpen(true);
    toggle();
  };

  const closeConversation = () => {
    Keyboard.dismiss();
    if (isActive) toggle();
    setChatOpen(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      {!chatOpen && (
        <>
          <View style={styles.header}>
            <View style={styles.brandGroup}>
              <Pressable style={styles.menuBtn} hitSlop={10}>
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
        </>
      )}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {chatOpen ? (
          <Animated.View style={styles.flex} entering={FadeIn.duration(220)} exiting={FadeOut.duration(150)}>
            <View style={styles.chatHeader}>
              <View style={styles.chatHeaderState}>
                {isActive && <AudioLinesIcon size={13} color={colors.accent} />}
                <Text style={styles.chatHeaderLabel}>
                  {isActive ? VOICE_PHASE_LABEL[orbState] : "Coach"}
                </Text>
              </View>
              {!isActive && (
                <Pressable style={styles.chatCloseBtn} onPress={closeConversation} hitSlop={8}>
                  <XIcon size={16} color="rgba(255,255,255,0.5)" />
                </Pressable>
              )}
            </View>
            <View style={styles.flex}>
              <VoiceAmbient state={orbState} active={isActive} />
              <ChatTranscript messages={transcript} coachTyping={coachTyping} voiceActive={isActive} />
            </View>
          </Animated.View>
        ) : (
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.hero}>
            <FloatingParticles />
            <HeroGlow />

            <View style={styles.heroTop}>
              <View style={styles.captionIconRow}>
                {timeBand === "Night" ? (
                  <MoonIcon size={18} color="rgba(180,190,255,0.85)" />
                ) : (
                  <SunIcon size={18} color="rgba(251,180,60,0.85)" />
                )}
              </View>
              <Text style={styles.captionGreeting}>{getGreeting(timeBand, userName)}</Text>
              <Text style={styles.captionMain}>{loading ? "" : coachMessage}</Text>
              <Text style={styles.captionSub}>{loading ? "" : getMomentumLine(streakDays)}</Text>

              {!loading && (
                <View style={styles.metaRow}>
                  {loadError ? (
                    <Pressable style={styles.restLine} onPress={refetch}>
                      <View style={styles.restLineDot} />
                      <Text style={styles.restLineText}>{loadError} Tap to retry</Text>
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
                      <Text style={styles.slimSessionName}>{todaySession.name}</Text>
                      <Text style={styles.slimSessionTime}>
                        {todaySession.exerciseCountLabel}
                      </Text>
                      <Text style={styles.slimSessionArrow}>→</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.restLine}>
                      <View style={styles.restLineDot} />
                      <Text style={styles.restLineText}>
                        Rest day — focus on recovery
                      </Text>
                    </View>
                  )}

                  {/* Not yet wired to anything — Calendar screen isn't built. Deliberately
                      styled inert (muted icon, no Pressable) rather than left looking tappable
                      with no action behind it. */}
                  <View style={styles.planPill}>
                    <CalendarIcon size={12} color={colors.muted} />
                    <Text style={styles.planPillText}>Today's Plan</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={styles.orbWrap}>
              <Pressable style={styles.orbBtn} onPress={handleTalk} hitSlop={16}>
                <VoiceOrb state={orbState} size={104} />
              </Pressable>
              <Text style={styles.orbHint}>
                {isActive ? "tap to stop" : "tap to talk"}
              </Text>
            </View>
          </View>
          </TouchableWithoutFeedback>
        )}

        <ChatComposer
          value={draftText}
          onChangeText={setDraftText}
          onSend={handleSend}
          onFocus={() => setChatOpen(true)}
          focused={composerFocused}
          onFocusChange={setComposerFocused}
          onTalkTap={handleTalk}
          talkActive={isActive && chatOpen}
          onExitVoiceToKeyboard={toggle}
          onCloseConversation={closeConversation}
        />
      </KeyboardAvoidingView>

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
              const pct = m.goal > 0 ? Math.min(Math.round((m.current / m.goal) * 100), 100) : 0;
              const remaining = m.goal - m.current;
              return (
                <View key={m.key} style={styles.macroRow}>
                  <View style={styles.macroRowTop}>
                    <View
                      style={[styles.macroRowDot, { backgroundColor: m.color }]}
                    />
                    <Text style={styles.macroRowLabel}>{m.label}</Text>
                    <View style={styles.macroRowValues}>
                      <Text style={[styles.macroRowCurrent, { color: m.color }]}>
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

  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 48,
  },
  chatHeaderState: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chatHeaderLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.36,
    color: "rgba(255,255,255,0.55)",
  },
  chatCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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

  captionIconRow: { marginBottom: 2 },

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
