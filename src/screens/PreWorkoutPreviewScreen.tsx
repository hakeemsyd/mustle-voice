import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { SwitchWorkoutSheet, CARDIO_ACTIVITIES } from "../components/SwitchWorkoutSheet";
import { AttachSheet } from "../components/AttachSheet";
import { GuideSheet } from "../components/GuideSheet";
import { StartingWorkoutOverlay } from "../components/StartingWorkoutOverlay";
import { SessionChatThread } from "../components/session-chat/SessionChatThread";
import { ChatChipRow, type ChatChip } from "../components/session-chat/ChatChipRow";
import { CollapsibleSessionCard } from "../components/session-chat/CollapsibleSessionCard";
import { SessionVoiceInputDock } from "../components/session-chat/SessionVoiceInputDock";
import { useSessionPreview } from "../hooks/useSessionPreview";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { usePlanAlternatives } from "../hooks/usePlanAlternatives";
import { useActiveSessionContext, type SessionTarget } from "../session/ActiveSessionContext";
import { useSharedVoiceSession } from "../session/VoiceSessionProvider";
import { getSwapCandidates, type SwapCandidate } from "../session/exerciseSwap";
import { chooseRestDay } from "../lib/restDay";
import { titleCase } from "../lib/textFormat";
import { callBrain, COACH_UNREACHABLE_MESSAGE } from "../lib/brain";
import { uploadChatFile, uploadChatImage } from "../lib/chatAttachments";
import { colors, fonts, lightCard } from "../constants/theme";
import { BackIcon } from "../icons/BackIcon";
import { ChevronDownIcon } from "../icons/ChevronDownIcon";
import { PlayIcon } from "../icons/PlayIcon";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "PreWorkoutPreview">;

interface ThreadMessage {
  id: string;
  role: "coach" | "user";
  text: string;
  imageUrl?: string;
}

// Module-level, not a ref — a per-instance useRef(0) resets on every mount, so two overlapping
// instances of this screen (a remount, or a lingering previous instance during a stack transition)
// can end up on the same message count at the same moment and generate an identical id. Living
// here instead means it never resets for as long as the JS process is alive, so that can't happen.
let globalMessageCounter = 0;

type ChipsState =
  | { kind: "none" }
  | { kind: "idle" }
  | { kind: "manage" }
  | { kind: "change-target" }
  | { kind: "change-pick"; exerciseName: string; candidates: SwapCandidate[] }
  | { kind: "guide-pick" }
  | { kind: "switch-pick" };

// Intro beats land one at a time rather than all at once — the thread is a conversation, and
// three messages appearing in the same frame reads as a wall of text, not a coach talking.
const INTRO_DELAY_MS = 400;
const INTRO_GAP_MS = 900;

function relativeDay(iso: string): string {
  const then = new Date(iso);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PreWorkoutPreviewScreen({ route, navigation }: Props) {
  const { planSessionId } = route.params;
  const { loading, error, focus, exercises, lastTime } = useSessionPreview(planSessionId);
  const insets = useScreenInsets();
  const session = useActiveSessionContext();
  const {
    orbState, isActive, toggle, connect, release, status: voiceStatus, reconnecting,
    isMuted, toggleMute, setMessageHandler, setSessionConfig,
  } = useSharedVoiceSession();
  const { alternatives: switchAlternatives } = usePlanAlternatives(planSessionId);

  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [draft, setDraft] = useState("");
  // Mic-first, matching the design: this is a voice-led surface, so the bar lands as the
  // centred toggle with no text field rather than an open keyboard composer. Tapping the
  // keyboard glyph swaps in the input pill.
  const [inputMode, setInputMode] = useState<"mic" | "keyboard">("mic");
  const [chips, setChips] = useState<ChipsState>({ kind: "none" });
  const [cardCollapsed, setCardCollapsed] = useState(true);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [guideExercise, setGuideExercise] = useState<{
    id: string;
    name: string;
    repScheme?: string;
    loadScheme?: string;
  } | null>(null);
  const [starting, setStarting] = useState(false);

  const inputRef = useRef<TextInput>(null);
  const seededRef = useRef(false);
  const pendingTargetRef = useRef<{ target: SessionTarget; resume: boolean } | null>(null);
  const introTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      introTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const isEmpty = !loading && !error && exercises.length === 0;
  const canResume = lastTime?.status === "partial" && lastTime.exercises.length > 0;
  const focusLabel = titleCase(focus) === "—" ? "Training" : titleCase(focus);

  const appendMessage = React.useCallback((role: "coach" | "user", text: string, imageUrl?: string) => {
    globalMessageCounter += 1;
    setMessages((prev) => [...prev, { id: `${Date.now()}-${globalMessageCounter}`, role, text, imageUrl }]);
  }, []);

  // This screen never claimed the shared conversation, so anything spoken here was still being
  // routed to whichever screen registered last (Home, or Global Chat) — the mic connected fine,
  // but the turns landed in someone else's thread, which looked exactly like "it isn't
  // listening". Claimed on focus, released on blur.
  useFocusEffect(
    React.useCallback(() => {
      setMessageHandler(({ role, text }) => appendMessage(role === "user" ? "user" : "coach", text));
      setSessionConfig({
        userId: session.userId,
        dynamicVariables: {
          user_name: session.userName ?? "there",
          user_id: session.userId ?? "",
          user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return () => setMessageHandler(null);
    }, [session.userId, session.userName, appendMessage, setMessageHandler, setSessionConfig]),
  );

  // Mic open on arrival, released on leaving. `release` rather than a hard disconnect so that
  // leaving *into* Active Session — which claims the same conversation — doesn't tear it down
  // and immediately redial it.
  useFocusEffect(
    React.useCallback(() => {
      if (inputMode === "mic" && !error && !isEmpty) connect();
      return release;
    }, [inputMode, error, isEmpty, connect, release]),
  );

  useEffect(() => {
    if (seededRef.current || loading || error || isEmpty) return;
    seededRef.current = true;

    const first = exercises[0];
    const beats: string[] = [
      `Here's your workout preview — **${focusLabel}**, ${exercises.length} exercise${
        exercises.length === 1 ? "" : "s"
      } today.${first ? ` First up: **${first.name}**, ${first.sets} × ${first.repScheme}.` : ""}`,
    ];

    if (lastTime && lastTime.exercises.length > 0) {
      const recap = lastTime.exercises
        .map(
          (done) =>
            `${done.name} — ${done.sets} sets · ${done.reps} reps${
              done.load && done.load !== "bodyweight" ? ` · ${done.load}` : ""
            }`,
        )
        .join("\n");
      beats.push(
        canResume
          ? `Looks like you stopped partway through last time (${relativeDay(
              lastTime.at,
            ).toLowerCase()}):\n${recap}\nWant to continue where you left off?`
          : `Last time (${relativeDay(lastTime.at)}):\n${recap}`,
      );
    }

    beats.push(
      "Want to add something or swap an exercise? Just tell me — by voice or text, or tap " +
        "**Manage Workout** below. Want to see how an exercise is done? Tap **Guide me**.",
    );

    beats.forEach((text, i) => {
      introTimersRef.current.push(
        setTimeout(() => appendMessage("coach", text), INTRO_DELAY_MS + i * INTRO_GAP_MS),
      );
    });
    introTimersRef.current.push(
      setTimeout(() => setChips({ kind: "idle" }), INTRO_DELAY_MS + beats.length * INTRO_GAP_MS),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, isEmpty]);

  const startSession = (target: SessionTarget, resume = false) => {
    pendingTargetRef.current = { target, resume };
    setStarting(true);
  };

  const handleStartAnimationComplete = () => {
    setStarting(false);
    const pending = pendingTargetRef.current;
    pendingTargetRef.current = null;
    if (!pending) return;
    // Only for this preview's own session, unswapped — a switched-to alternate or cardio target
    // has different real exercises than what `exercises`/`focus` above loaded for planSessionId,
    // so those still go through Active Session's own fetch rather than being handed stale data.
    const isThisSession =
      pending.target.type === "strength" &&
      pending.target.planSessionId === planSessionId &&
      !pending.target.switchedFromSessionId;
    session.start(
      pending.target,
      pending.resume && lastTime ? lastTime.exercises : undefined,
      isThisSession ? { focus, exercises } : undefined,
    );
    navigation.replace("ActiveSession");
  };

  const resetChips = () => setChips({ kind: "idle" });

  const handleRestDay = async () => {
    if (session.userId) await chooseRestDay(session.userId, planSessionId);
    navigation.goBack();
  };

  const handleIdleChip = (label: string) => {
    if (label === "Continue Session" || label === "Start Session") {
      appendMessage("user", label);
      startSession({ type: "strength", planSessionId }, canResume);
    } else if (label === "Restart Instead") {
      appendMessage("user", label);
      startSession({ type: "strength", planSessionId }, false);
    } else if (label === "Manage Workout") {
      appendMessage("user", label);
      appendMessage("coach", "Would you like to change an exercise, add one, or swap the entire workout?");
      setChips({ kind: "manage" });
    } else if (label === "Guide me") {
      appendMessage("user", label);
      appendMessage("coach", "Which exercise do you want a guide for?");
      setChips({ kind: "guide-pick" });
    }
  };

  const handleManageChip = (label: string) => {
    if (label === "Cancel") {
      setChips({ kind: "idle" });
      return;
    }
    appendMessage("user", label);
    if (label === "Change an Exercise") {
      appendMessage("coach", "Which one would you like to swap?");
      setChips({ kind: "change-target" });
    } else if (label === "Add an Exercise") {
      appendMessage(
        "coach",
        "I can't add an exercise mid-preview yet — talk to me about it once you're in the session, or ask for a full plan change.",
      );
      setChips({ kind: "idle" });
    } else if (label === "Change Workout") {
      appendMessage("coach", "Sure — let's find you a different workout.");
      setSwitchOpen(true);
    }
  };

  const handleSubChip = async (label: string) => {
    if (label === "Cancel") {
      resetChips();
      return;
    }

    if (chips.kind === "change-target") {
      const exercise = exercises.find((e) => e.name === label);
      if (!exercise) return;
      appendMessage("user", label);
      appendMessage("coach", "One sec — checking safe alternates…");
      const candidates = session.userId ? await getSwapCandidates(session.userId, exercise.exerciseId) : [];
      if (candidates.length === 0) {
        appendMessage("coach", "No safe alternates found for that one.");
        resetChips();
        return;
      }
      setChips({ kind: "change-pick", exerciseName: exercise.name, candidates });
      return;
    }

    if (chips.kind === "change-pick") {
      const candidate = chips.candidates.find((c) => c.name === label);
      if (!candidate) return;
      appendMessage("user", label);
      appendMessage(
        "coach",
        `${candidate.name} looks like a safe alternate for ${chips.exerciseName}. Open the exercise menu once you start the session to swap it in.`,
      );
      resetChips();
      return;
    }

    if (chips.kind === "guide-pick") {
      const exercise = exercises.find((e) => e.name === label);
      if (!exercise) return;
      setGuideExercise({
        id: exercise.exerciseId,
        name: exercise.name,
        repScheme: exercise.repScheme,
        loadScheme: exercise.loadScheme ?? undefined,
      });
      resetChips();
      return;
    }

    if (chips.kind === "switch-pick") {
      if (label === "Take a Rest Day") {
        resetChips();
        void handleRestDay();
        return;
      }
      const alt = switchAlternatives.find((a) => titleCase(a.focus) === label);
      if (alt) {
        resetChips();
        startSession({ type: "strength", planSessionId: alt.planSessionId, switchedFromSessionId: planSessionId });
        return;
      }
      if ((CARDIO_ACTIVITIES as readonly string[]).includes(label)) {
        resetChips();
        startSession({ type: "cardio", activity: label, switchedFromSessionId: planSessionId });
      }
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !session.userId) return;
    setDraft("");
    appendMessage("user", text);
    setThinking(true);
    try {
      const result = await callBrain(session.userId, text, "text");
      appendMessage("coach", result.reply);
    } catch (err) {
      console.error("[preview] coach call failed:", err);
      appendMessage("coach", COACH_UNREACHABLE_MESSAGE);
    } finally {
      setThinking(false);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) void sendImage(asset.uri);
  };

  const handleChooseLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) void sendImage(asset.uri);
  };

  const handleChooseFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: "*/*" });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset) void sendFile(asset.uri, asset.name);
  };

  // The local URI goes into the thread immediately, before the upload starts — waiting for a
  // signed URL first would leave a visible gap where the photo the user just picked isn't
  // anywhere on screen.
  const sendImage = async (uri: string) => {
    if (!session.userId) return;
    appendMessage("user", "", uri);
    setThinking(true);
    try {
      const signedUrl = await uploadChatImage(session.userId, uri);
      const result = await callBrain(session.userId, "", "image", false, undefined, undefined, signedUrl);
      appendMessage("coach", result.reply);
    } catch (err) {
      console.error("[preview] attach image failed:", err);
      appendMessage("coach", COACH_UNREACHABLE_MESSAGE);
    } finally {
      setThinking(false);
    }
  };

  const sendFile = async (uri: string, name: string) => {
    if (!session.userId) return;
    appendMessage("user", `Attached: ${name}`);
    setThinking(true);
    try {
      await uploadChatFile(session.userId, uri, name);
      const result = await callBrain(session.userId, `Attached a file: ${name}`, "file");
      appendMessage("coach", result.reply);
    } catch (err) {
      console.error("[preview] attach file failed:", err);
      appendMessage("coach", COACH_UNREACHABLE_MESSAGE);
    } finally {
      setThinking(false);
    }
  };

  const idleChips: ChatChip[] = [
    { label: canResume ? "Continue Session" : "Start Session", primary: true },
    ...(canResume ? [{ label: "Restart Instead" }] : []),
    { label: "Manage Workout" },
    { label: "Guide me" },
  ];

  const manageChips: ChatChip[] = [
    { label: "Change an Exercise" },
    { label: "Add an Exercise" },
    { label: "Change Workout" },
    { label: "Cancel" },
  ];

  const subChips: ChatChip[] =
    chips.kind === "change-target"
      ? [...exercises.map((e) => ({ label: e.name })), { label: "Cancel" }]
      : chips.kind === "change-pick"
        ? [...chips.candidates.map((c) => ({ label: c.name })), { label: "Cancel" }]
        : chips.kind === "guide-pick"
          ? [...exercises.map((e) => ({ label: e.name })), { label: "Cancel" }]
          : chips.kind === "switch-pick"
            ? [
                { label: "Take a Rest Day" },
                ...switchAlternatives.map((a) => ({ label: titleCase(a.focus) })),
                ...CARDIO_ACTIVITIES.map((activity) => ({ label: activity })),
                { label: "Cancel" },
              ]
            : [];

  const activeChips: ChatChip[] =
    chips.kind === "none" ? [] : chips.kind === "idle" ? idleChips : chips.kind === "manage" ? manageChips : subChips;

  const handleChipPick = (label: string) => {
    if (chips.kind === "idle") handleIdleChip(label);
    else if (chips.kind === "manage") handleManageChip(label);
    else void handleSubChip(label);
  };

  // Fixed heights, not content-derived: the card animates between two real numbers, and the
  // expanded list scrolls internally for a session long enough to overflow.
  const collapsedHeight = 60;
  const expandedHeight = 320;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerSide}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <BackIcon size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>WORKOUT PREVIEW</Text>
        <View style={styles.headerSide} />
      </View>

      {loading ? (
        <View style={styles.skeletonWrap}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.skeletonLine} />
          ))}
        </View>
      ) : error || isEmpty ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>{error ? "Couldn't load this session" : "Nothing scheduled"}</Text>
          <Text style={styles.emptySub}>{error ?? "No exercises found for this session yet."}</Text>
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <SessionChatThread
            messages={messages}
            typing={thinking}
            footer={
              activeChips.length > 0 && !thinking ? (
                <ChatChipRow chips={activeChips} onPick={handleChipPick} />
              ) : null
            }
          />

          <CollapsibleSessionCard
            collapsed={cardCollapsed}
            collapsedHeight={collapsedHeight}
            expandedHeight={expandedHeight}
            backgroundColor={lightCard.bg}
          >
            {cardCollapsed ? (
              <View style={styles.cardCollapsedRow}>
                <Pressable style={styles.cardCollapsedInfo} onPress={() => setCardCollapsed(false)}>
                  <Text style={styles.cardBadge}>PREVIEW</Text>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {focusLabel.toUpperCase()}
                  </Text>
                  <Text style={styles.cardCount}>
                    {exercises.length} exercise{exercises.length === 1 ? "" : "s"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.cardPlayBtn}
                  onPress={() => startSession({ type: "strength", planSessionId }, canResume)}
                  hitSlop={8}
                >
                  <PlayIcon size={13} color={colors.accentOn} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.cardExpandedInner}>
                <Pressable style={styles.cardExpandedHeader} onPress={() => setCardCollapsed(true)}>
                  <Text style={styles.cardExpandedTitle} numberOfLines={1}>
                    {focusLabel.toUpperCase()}
                  </Text>
                  <ChevronDownIcon size={16} color={lightCard.muted} />
                </Pressable>

                <ScrollView style={styles.cardExerciseList} showsVerticalScrollIndicator={false}>
                  {exercises.map((exercise, i) => (
                    <View
                      key={exercise.id}
                      style={[styles.cardExerciseRow, i === exercises.length - 1 && styles.cardExerciseRowLast]}
                    >
                      <Text style={styles.cardExerciseIndex}>{String(i + 1).padStart(2, "0")}</Text>
                      <Text style={styles.cardExerciseName} numberOfLines={1}>
                        {exercise.name}
                      </Text>
                      <Text style={styles.cardExerciseMeta}>
                        {exercise.sets} × {exercise.repScheme}
                      </Text>
                    </View>
                  ))}
                </ScrollView>

                <Text style={styles.cardManageHint}>
                  Want to change, add, or swap an exercise — or switch the whole workout? Just tell your coach in
                  chat.
                </Text>

                <View style={styles.cardControlsRow}>
                  <Pressable
                    style={styles.cardStartBtn}
                    onPress={() => startSession({ type: "strength", planSessionId }, canResume)}
                  >
                    <PlayIcon size={13} color={colors.accentOn} />
                    <Text style={styles.cardStartText}>{canResume ? "Continue Session" : "Start Session"}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </CollapsibleSessionCard>

          <View style={[styles.inputDock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <SessionVoiceInputDock
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              onSend={handleSend}
              mode={inputMode}
              onModeChange={setInputMode}
              isVoiceActive={isActive}
              onToggleVoice={toggle}
              orbState={orbState}
              voiceStatus={voiceStatus}
              reconnecting={reconnecting}
              placeholder="Add anything else…"
              onAttachTap={() => setAttachOpen(true)}
              muted={isMuted}
              onToggleMute={toggleMute}
            />
          </View>
        </KeyboardAvoidingView>
      )}

      <StartingWorkoutOverlay open={starting} onComplete={handleStartAnimationComplete} />

      <AttachSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        onTakePhoto={handleTakePhoto}
        onChooseLibrary={handleChooseLibrary}
        onChooseFile={handleChooseFile}
      />

      <SwitchWorkoutSheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        currentPlanSessionId={planSessionId}
        confirmDescription={`This replaces ${focus ? titleCase(focus) : "today's session"} with a different type — nothing's been logged yet, so nothing is lost.`}
        onConfirm={(target) => {
          setSwitchOpen(false);
          startSession({ ...target, switchedFromSessionId: planSessionId } as SessionTarget);
        }}
        onProceedToChat={() => {
          setSwitchOpen(false);
          appendMessage("coach", "Which workout would you like instead?");
          setChips({ kind: "switch-pick" });
        }}
        onRestDay={() => {
          setSwitchOpen(false);
          void handleRestDay();
        }}
      />

      <GuideSheet
        open={guideExercise !== null}
        onClose={() => setGuideExercise(null)}
        exerciseId={guideExercise?.id ?? null}
        exerciseName={guideExercise?.name ?? null}
        repScheme={guideExercise?.repScheme}
        loadScheme={guideExercise?.loadScheme}
      />
    </View>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  // A fixed-width, transparent slot on each side so the title stays optically centred. The
  // right-hand one used to reuse the back button's style, which drew a real filled circle in
  // the corner with nothing in it.
  headerSide: {
    width: 34,
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: colors.muted,
  },
  skeletonWrap: {
    gap: 10,
    paddingHorizontal: 20,
  },
  skeletonLine: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.surface,
    opacity: 0.6,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
  emptySub: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  // Collapsed: one row — black PREVIEW tag, workout name and exercise count all inline, with a
  // filled round Start button opposite. The count used to sit stacked under the name, which made
  // the 60px row read as two cramped lines instead of one.
  cardCollapsedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    height: "100%",
    paddingHorizontal: 16,
  },
  cardCollapsedInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardBadge: {
    overflow: "hidden",
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.55,
    color: "#FFFFFF",
    backgroundColor: "#0A0A0A",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  cardTitle: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 0.42,
    color: lightCard.text,
  },
  cardCount: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: "rgba(10,10,10,0.55)",
  },
  cardPlayBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },

  cardExpandedInner: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  cardExpandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(10,10,10,0.08)",
  },
  cardExpandedTitle: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.54,
    color: lightCard.text,
  },
  cardExerciseList: {
    flex: 1,
  },
  cardExerciseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: lightCard.dividerBg,
  },
  cardExerciseRowLast: {
    borderBottomWidth: 0,
  },
  cardExerciseIndex: {
    width: 20,
    fontFamily: fonts.display,
    fontSize: 14,
    color: "rgba(10,10,10,0.35)",
  },
  cardExerciseName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: lightCard.text,
    textTransform: "uppercase",
  },
  cardExerciseMeta: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: "rgba(10,10,10,0.5)",
  },
  // Replaces the Manage button the card used to carry — every edit routes through chat now, so
  // this says so, right where that button was.
  cardManageHint: {
    paddingTop: 10,
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 17.5,
    color: "rgba(10,10,10,0.45)",
  },
  cardControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(10,10,10,0.08)",
  },
  cardStartBtn: {
    flex: 1,
    flexDirection: "row",
    height: 34,
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  cardStartText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    letterSpacing: 0.25,
    color: colors.accentOn,
  },

  inputDock: {
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
