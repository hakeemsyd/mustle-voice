import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { VoiceOrb } from "../components/VoiceOrb";
import { FloatingParticles } from "../components/FloatingParticles";
import { HeroGlow } from "../components/HeroGlow";
import { RestTimerPanel } from "../components/RestTimerPanel";
import { useRestRemaining } from "../hooks/useRestRemaining";
import { SessionCoachCard, type CoachCardState } from "../components/SessionCoachCard";
import { SessionInputBar } from "../components/SessionInputBar";
import { SessionControlBar } from "../components/SessionControlBar";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { GuideSheet } from "../components/GuideSheet";
import { SwitchWorkoutSheet } from "../components/SwitchWorkoutSheet";
import { PostWorkoutFeedback } from "../components/PostWorkoutFeedback";
import { formatClock } from "../components/MiniSessionBar";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { colors, fonts } from "../constants/theme";
import { BookOpenIcon, ChevronDownIcon, PauseIcon, PlayIcon } from "../icons";
import { describeParsedSet, looksLikeSetReport, parseSetReport } from "../lib/parseSetReport";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ActiveSession">;

export function ActiveSessionScreen({ navigation }: Props) {
  const insets = useScreenInsets();
  const session = useActiveSessionContext();

  const [draft, setDraft] = useState("");
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);

  const {
    target, loading, error, focus, exercises, currentExercise, currentExerciseIndex,
    loggedSets, resting, restKey, restTargetSec, restEndAt, restPausedRemainingSec,
    ended, endedStatus, saving, hasLoggedAnySet,
    coachMessage, coachThinking, elapsedSec, paused,
  } = session;

  const isCardio = target?.type === "cardio";

  const commitSet = (weight: number | null, reps: number) => {
    session.logSet(weight, reps);
    session.noteSetLogged(describeParsedSet({ weight, reps }));
    setDraft("");
  };

  // sendContextualUpdate isn't available yet when this closure below is created (it comes back
  // from the useVoiceSession call this closure is passed into) — a ref lets the closure reach
  // whatever the latest one is once it exists, instead of only ever seeing the first render's.
  const sendContextRef = useRef<((text: string) => void) | null>(null);

  // Same identity Home passes — without it the agent's prompt template has no
  // {{user_name}} to fill and ElevenLabs drops the conversation on connect.
  //
  // ElevenLabs isn't wired to our tools yet (docs/coaching-brain.md's Custom LLM bridge is a
  // deliberately separate next step), so its agent has its own real conversation with the user
  // and no visibility into what the app does. Without the sendContextualUpdate call below, the
  // agent has no idea a spoken set report was just logged and keeps asking about it — which
  // exercise, whether it's a first attempt — as if nothing happened, because as far as its own
  // conversation is concerned, nothing has. Only the user's own turns are checked (never the
  // agent's replies, or they'd get re-parsed as if the user said them); free-form talk still
  // plays out purely through ElevenLabs' own conversation — routing it to askCoach too would
  // produce two independent, disagreeing coaches answering the same thing in different channels.
  const { orbState, isActive, toggle, sendContextualUpdate } = useVoiceSession(
    (message) => {
      if (message.role !== "user" || isCardio || resting) return;
      if (!looksLikeSetReport(message.text)) return;
      const parsed = parseSetReport(message.text);
      if (!parsed) return;
      commitSet(parsed.weight, parsed.reps);
      const setNumber = currentSetCount + 1;
      const loadLabel = parsed.weight !== null ? `${parsed.weight}kg` : "bodyweight";
      sendContextRef.current?.(
        `The app just logged this set directly from what the user said: ${currentExercise?.name ?? "the current exercise"}, ` +
          `set ${setNumber}${currentExercise ? ` of ${currentExercise.sets}` : ""}, ${loadLabel} × ${parsed.reps} reps. ` +
          `It's already recorded — don't ask what exercise it was, whether they've done it before, or ask them to confirm ` +
          `any of these details. Acknowledge in one short sentence and move the conversation forward.`,
      );
    },
    {
      userId: session.userId,
      dynamicVariables: { user_name: session.userName ?? "there" },
    },
  );

  useEffect(() => {
    sendContextRef.current = sendContextualUpdate;
  }, [sendContextualUpdate]);

  // Opening the screen is what "restored" means — the MiniSessionBar hides again.
  useEffect(() => {
    session.restore();
  }, []);

  const currentSetCount = loggedSets[currentExerciseIndex]?.length ?? 0;
  const parsedDraft = parseSetReport(draft);
  const restRemaining = useRestRemaining(restEndAt, restPausedRemainingSec);

  const coachState: CoachCardState = coachThinking
    ? "thinking"
    : isActive && orbState === "listening"
      ? "listening"
      : isActive && orbState === "speaking"
        ? "speaking"
        : "idle";

  const orbHint = isActive
    ? orbState === "listening"
      ? "LISTENING…"
      : orbState === "processing"
        ? "THINKING…"
        : orbState === "speaking"
          ? "SPEAKING"
          : "VOICE ON · TAP TO STOP"
    : resting
      ? "RESTING · TAP TO TALK"
      : "TAP TO TALK";

  // One field, two destinations: a parsable set report logs the set; anything
  // else goes to the coach. Matches the design's single-input model.
  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    if (!isCardio && !resting && looksLikeSetReport(text)) {
      const parsed = parseSetReport(text);
      if (parsed) {
        commitSet(parsed.weight, parsed.reps);
        return;
      }
    }
    setDraft("");
    void session.askCoach(text);
  };

  const handleDoneSet = () => {
    if (resting || !currentExercise) return;
    if (parsedDraft) {
      commitSet(parsedDraft.weight, parsedDraft.reps);
      return;
    }
    Alert.alert(
      "Log this set?",
      "Add the weight and reps first — e.g. “60kg 8 reps” — so it's recorded accurately.",
      [{ text: "OK" }],
    );
  };

  // Minimize keeps the session running and drops the user back to the app; ending it is a
  // separate, always-confirmed action.
  //
  // goBack(), not navigate("Tabs") — PreWorkoutPreviewScreen reaches here via replace(), so
  // Tabs is always the screen directly beneath this one. navigate() only pops back to an
  // existing screen "if" the navigator judges one already present; goBack() is unconditional,
  // so minimize can never instead push a second Tabs on top of this still-mounted screen —
  // which is what was actually showing this screen's own header bleeding through Home's top.
  const handleMinimize = () => {
    session.minimize();
    navigation.goBack();
  };

  // Ending by hand is always a partial strength session — a fully finished one ends itself
  // from logSet. Cardio has no set count to fall short of, so it saves as completed.
  const confirmEnd = async () => {
    setEndConfirmOpen(false);
    // Nothing logged means there's no workout_log row to attach feedback to, so asking for
    // it would throw the answer away. Just back out of the session.
    if (!isCardio && !hasLoggedAnySet) {
      closeOut();
      return;
    }
    await session.endSession(isCardio ? "completed" : "partial");
  };

  const closeOut = () => {
    const workoutLogId = session.workoutLogId;
    session.clear();
    if (workoutLogId) {
      navigation.replace("SessionReport", { workoutLogId });
    } else {
      navigation.goBack();
    }
  };

  const handleSwitchConfirm = (next: Parameters<typeof session.start>[0]) => {
    setSwitchOpen(false);
    const switchedFrom = target?.type === "strength" ? target.planSessionId : undefined;
    session.start({ ...next, switchedFromSessionId: switchedFrom } as typeof next);
  };

  const showBars = !loading && !error && !ended && (isCardio || exercises.length > 0);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable style={styles.closeBtn} onPress={handleMinimize} hitSlop={8}>
          <ChevronDownIcon size={18} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.sessionLabel}>ACTIVE SESSION</Text>
          <Text style={styles.exerciseNameHeader} numberOfLines={1}>
            {isCardio
              ? (target?.type === "cardio" ? target.activity : "").toUpperCase()
              : (ended ? focus ?? "" : currentExercise?.name ?? focus ?? "").toUpperCase()}
          </Text>
        </View>
        {!isCardio && currentExercise && !ended ? (
          <Pressable style={styles.closeBtn} onPress={() => setGuideOpen(true)} hitSlop={8}>
            <BookOpenIcon size={15} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      ) : error || (!isCardio && exercises.length === 0) ? (
        <View style={styles.centerFill}>
          <Text style={styles.muted}>{error ?? "No exercises found for this session"}</Text>
        </View>
      ) : ended && endedStatus ? (
        <ScrollView contentContainerStyle={styles.feedbackScroll} keyboardShouldPersistTaps="handled">
          <PostWorkoutFeedback
            status={endedStatus}
            saving={saving}
            onSubmit={async (note, tags) => {
              await session.submitFeedback(note, tags);
              closeOut();
            }}
            onSkip={closeOut}
          />
          <View style={styles.summaryBlock}>
            {isCardio ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryName}>
                  {target?.type === "cardio" ? target.activity : "Cardio"}
                </Text>
                <Text style={styles.summaryCount}>{formatClock(elapsedSec)}</Text>
              </View>
            ) : (
              exercises.map((exercise, i) => (
                <View key={exercise.id} style={styles.summaryRow}>
                  <Text style={styles.summaryName}>{exercise.name}</Text>
                  <Text style={styles.summaryCount}>
                    {loggedSets[i]?.length ?? 0} / {exercise.sets} sets
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.body}>
          <View style={styles.hero}>
            <FloatingParticles />
            <HeroGlow />
            <Pressable style={styles.orbBtn} onPress={toggle} hitSlop={12}>
              <VoiceOrb state={orbState} size={115} />
            </Pressable>
            <Text style={styles.orbHint}>{orbHint}</Text>
          </View>

          <View style={styles.coachZone}>
            <SessionCoachCard state={coachState} message={coachMessage} />
          </View>

          <View style={styles.targetZone}>
            {isCardio ? (
              <View style={styles.targetCard}>
                <Text style={styles.targetSetLabel}>ELAPSED</Text>
                <Text style={styles.targetValue}>{formatClock(elapsedSec)}</Text>
                <Pressable
                  style={styles.pauseBtn}
                  onPress={() => session.setPaused(!paused)}
                >
                  {paused ? (
                    <PlayIcon size={13} color={colors.text} />
                  ) : (
                    <PauseIcon size={13} color={colors.text} />
                  )}
                  <Text style={styles.pauseText}>{paused ? "Resume" : "Pause"}</Text>
                </Pressable>
              </View>
            ) : resting && currentExercise ? (
              <RestTimerPanel
                key={restKey}
                remaining={restRemaining}
                targetSec={restTargetSec}
                paused={restPausedRemainingSec !== null}
                onExtend={session.extendRest}
                onTogglePause={session.toggleRestPause}
                nextSet={{
                  exerciseName: currentExercise.name,
                  setNumber: currentSetCount + 1,
                  detail: [currentExercise.repScheme, currentExercise.loadScheme].filter(Boolean).join(" · "),
                }}
                onContinue={session.finishRest}
              />
            ) : currentExercise ? (
              <View style={styles.targetCard}>
                <Text style={styles.targetSetLabel}>
                  SET {currentSetCount + 1} OF {currentExercise.sets}
                </Text>
                <Text style={styles.targetValue}>{currentExercise.repScheme}</Text>
                <Text style={styles.targetSub}>
                  {currentExercise.loadScheme ? `TARGET REPS · ${currentExercise.loadScheme}` : "TARGET REPS"}
                </Text>
              </View>
            ) : null}
          </View>

          {!isCardio && currentExercise && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>SETS LOGGED</Text>
                <Text style={styles.statValue}>
                  {currentSetCount}/{currentExercise.sets}
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>REST TARGET</Text>
                <Text style={styles.statValue}>{restTargetSec}s</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>LOAD</Text>
                <Text style={styles.statValue}>{currentExercise.loadScheme ?? "—"}</Text>
              </View>
            </View>
          )}
        </View>
        </TouchableWithoutFeedback>
      )}

      {showBars && (
        <>
          <SessionInputBar
            value={draft}
            onChangeText={setDraft}
            onSend={handleSend}
            parsePreview={!isCardio && parsedDraft ? describeParsedSet(parsedDraft) : null}
          />
          <SessionControlBar
            onDoneTap={handleDoneSet}
            doneEnabled={!resting && !isCardio}
            onEndTap={() => setEndConfirmOpen(true)}
            onManageTap={() => setSwitchOpen(true)}
          />
        </>
      )}

      <ConfirmSheet
        open={endConfirmOpen}
        title="Are you sure you're done for today?"
        description={
          isCardio
            ? `You've been going for ${formatClock(elapsedSec)}. Ending now saves this session as completed.`
            : hasLoggedAnySet
              ? "Ending now saves the sets you've logged as a partial session."
              : "Nothing's been logged yet — ending now saves this as a partial session."
        }
        confirmLabel="End workout"
        cancelLabel="Keep going"
        destructive
        onCancel={() => setEndConfirmOpen(false)}
        onConfirm={confirmEnd}
      />

      <GuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        exerciseId={currentExercise?.exerciseId ?? null}
        exerciseName={currentExercise?.name ?? null}
        repScheme={currentExercise?.repScheme}
        loadScheme={currentExercise?.loadScheme ?? undefined}
      />

      <SwitchWorkoutSheet
        open={switchOpen}
        onClose={() => setSwitchOpen(false)}
        currentPlanSessionId={target?.type === "strength" ? target.planSessionId : undefined}
        confirmDescription={
          hasLoggedAnySet
            ? "The sets you've already logged in this session will be discarded — nothing has been saved yet."
            : "Nothing's been logged yet, so nothing is lost."
        }
        onConfirm={handleSwitchConfirm}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerSpacer: {
    width: 34,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  sessionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.muted,
  },
  exerciseNameHeader: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.4,
    color: colors.text,
  },
  body: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.muted,
    textAlign: "center",
  },
  hero: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
    height: 250,
  },
  orbBtn: {
    alignItems: "center",
    justifyContent: "center",
  },
  orbHint: {
    marginTop: 14,
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.6,
    color: colors.muted,
  },
  coachZone: {
    paddingHorizontal: 16,
  },
  targetZone: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  targetCard: {
    alignItems: "center",
    gap: 6,
  },
  targetSetLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: colors.muted,
  },
  targetValue: {
    fontFamily: fonts.display,
    fontSize: 68,
    letterSpacing: 1,
    color: colors.text,
  },
  targetSub: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.muted,
  },
  pauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pauseText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  statLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.1,
    color: colors.muted,
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.4,
    color: colors.text,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: colors.borderSubtle,
  },
  feedbackScroll: {
    paddingBottom: 24,
  },
  summaryBlock: {
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryName: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13.5,
    color: colors.text,
  },
  summaryCount: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
});
