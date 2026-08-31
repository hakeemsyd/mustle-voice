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
import { ManageSessionSheet } from "../components/ManageSessionSheet";
import { PostWorkoutFeedback } from "../components/PostWorkoutFeedback";
import { formatClock } from "../components/MiniSessionBar";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useVoiceSession } from "../hooks/useVoiceSession";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { colors, fonts } from "../constants/theme";
import { BookOpenIcon, ChevronDownIcon, PauseIcon, PlayIcon } from "../icons";
import { describeParsedSet, looksLikeSetReport, parseSetReport } from "../lib/parseSetReport";
import { buildLiveSessionSnapshot, describeLiveSessionSnapshot } from "../session/liveSessionState";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ActiveSession">;

export function ActiveSessionScreen({ navigation }: Props) {
  const insets = useScreenInsets();
  const session = useActiveSessionContext();

  const [draft, setDraft] = useState("");
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const {
    target, loading, error, focus, exercises, currentExercise, currentExerciseIndex,
    loggedSets, resting, restKey, restTargetSec, restEndAt, restPausedRemainingSec,
    ended, endedStatus, saving, hasLoggedAnySet,
    coachMessage, coachThinking, elapsedSec, paused,
    removeQueuedExercise, swapQueuedExercise,
  } = session;

  const isCardio = target?.type === "cardio";
  const restRemaining = useRestRemaining(restEndAt, restPausedRemainingSec);

  // viaVoice=true skips the set_logged coach cue below — a voice-reported set already got the
  // user's own spoken turn, so the agent naturally replies on its own; only a typed/tapped log
  // needs a cue to prompt a spoken confirmation, since nobody spoke for that one.
  const commitSet = (weight: number | null, reps: number, viaVoice = false) => {
    session.logSet(weight, reps);
    session.noteSetLogged(describeParsedSet({ weight, reps }));
    setDraft("");
    if (!viaVoice) triggerCueRef.current?.("set_logged");
  };

  // sendContextualUpdate isn't available yet when this closure below is created (it comes back
  // from the useVoiceSession call this closure is passed into) — a ref lets the closure reach
  // whatever the latest one is once it exists, instead of only ever seeing the first render's.
  const sendContextRef = useRef<((text: string) => void) | null>(null);
  // Same story for the proactive-coaching cue trigger, defined further below.
  const triggerCueRef = useRef<((cue: string) => void) | null>(null);

  const {
    orbState, isActive, status: voiceStatus, toggle, sendContextualUpdate, sendUserMessage,
    reconnecting, voiceDropped, idleClosed,
  } = useVoiceSession(
    (message) => {
      if (message.role !== "user" || isCardio || resting) return;
      if (!looksLikeSetReport(message.text)) return;
      const parsed = parseSetReport(message.text);
      if (!parsed) return;
      commitSet(parsed.weight, parsed.reps, true);
      const setNumber = currentSetCount + 1;
      const loadLabel = parsed.weight !== null ? `${parsed.weight}kg` : "bodyweight";
      try {
        sendContextRef.current?.(
          `The app just logged this set directly from what the user said: ${currentExercise?.name ?? "the current exercise"}, ` +
            `set ${setNumber}${currentExercise ? ` of ${currentExercise.sets}` : ""}, ${loadLabel} × ${parsed.reps} reps. ` +
            `It's already recorded — don't ask what exercise it was, whether they've done it before, or ask them to confirm ` +
            `any of these details. Acknowledge in one short sentence and move the conversation forward.`,
        );
      } catch (err) {
        console.error("[active session] failed to send set-logged context to voice:", err);
      }
    },
    {
      userId: session.userId,
      dynamicVariables: {
        user_name: session.userName ?? "there",
        user_id: session.userId ?? "",
        user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  );

  useEffect(() => {
    sendContextRef.current = sendContextualUpdate;
  }, [sendContextualUpdate]);

  // sendUserMessage (unlike sendContextualUpdate) makes the agent actually produce a spoken
  // reply — the only client call that does — so it's what drives proactive coaching moments
  // where nobody has spoken (greeting the workout, announcing rest, prompting the next set).
  // The [[SYSTEM_CUE]] marker tells brain-voice this wasn't really said by the user (see
  // brain-config.ts) and logs it hidden from the visible transcript.
  useEffect(() => {
    triggerCueRef.current = (cue: string) => {
      if (voiceStatus !== "connected") return;
      try {
        sendUserMessage(`[[SYSTEM_CUE]] ${cue}`);
      } catch (err) {
        console.error("[active session] failed to send coach cue:", err);
      }
    };
  }, [voiceStatus, sendUserMessage]);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // Pushes the live session state (exercise, set, rest status) into the running voice
  // conversation on every structural change — this is the coach's only source of ground truth
  // for what the screen actually shows. Deliberately excludes restEndAt/elapsedSec from the
  // dependency list — those tick every second and would spam a contextual update per second;
  // resting/restTargetSec/restPausedRemainingSec already capture every transition worth telling
  // the coach about.
  //
  // Must gate on status === "connected", not isActive — isActive is also true while still
  // "connecting", before the underlying conversation object exists. Calling
  // sendContextualUpdate that early throws ("No active conversation. Call startSession()
  // first.") and crashes the screen — confirmed live.
  useEffect(() => {
    if (voiceStatus !== "connected") return;
    const snapshot = buildLiveSessionSnapshot({
      target,
      focus,
      exercises,
      currentExerciseIndex,
      loggedSets,
      resting,
      restTargetSec,
      restEndAt: session.restEndAt,
      restPausedRemainingSec,
      ended,
      paused,
      elapsedSec,
    });
    if (!snapshot) return;
    try {
      sendContextRef.current?.(describeLiveSessionSnapshot(snapshot));
    } catch (err) {
      console.error("[active session] failed to send live state to voice:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceStatus, target, focus, exercises, currentExerciseIndex, loggedSets, resting, restTargetSec, restPausedRemainingSec, paused, ended]);

  // Greets once per session, as soon as both a real session and a connected voice call exist —
  // whichever arrives second triggers it. Keyed on the target object itself (a fresh one each
  // session.start()) rather than a boolean, so a brand-new session always re-greets.
  const greetedSessionRef = useRef<typeof target>(null);
  useEffect(() => {
    if (!target || ended || voiceStatus !== "connected") return;
    if (!isCardio && !currentExercise) return;
    if (greetedSessionRef.current === target) return;
    greetedSessionRef.current = target;
    triggerCueRef.current?.("session_start");
  }, [target, ended, voiceStatus, isCardio, currentExercise]);

  // Rest-period proactive cues: a heads-up a few seconds before it ends, a prompt once it
  // actually hits zero, and — only if they still haven't moved on a while after that — a single
  // non-repetitive check-in. Guarded per rest period (restKey) so each only ever fires once per
  // rest, and `restingRef` gives the delayed check-in a live read of whether rest is still going
  // by the time its timer fires, not the stale value from when it was scheduled.
  const restCueStateRef = useRef({ key: -1, countdown: false, over: false, silence: false });
  const restingRef = useRef(resting);
  restingRef.current = resting;
  useEffect(() => {
    if (restCueStateRef.current.key !== restKey) {
      restCueStateRef.current = { key: restKey, countdown: false, over: false, silence: false };
    }
  }, [restKey]);

  useEffect(() => {
    if (!resting || voiceStatus !== "connected") return;
    const state = restCueStateRef.current;
    if (state.key !== restKey) return;
    if (restRemaining <= 0 && !state.over) {
      state.over = true;
      triggerCueRef.current?.("rest_over");
      setTimeout(() => {
        const s = restCueStateRef.current;
        if (s.key === restKey && !s.silence && restingRef.current) {
          s.silence = true;
          triggerCueRef.current?.("silence_after_rest");
        }
      }, 20_000);
    } else if (restRemaining > 0 && restRemaining <= 10 && !state.countdown) {
      state.countdown = true;
      triggerCueRef.current?.("rest_final_countdown");
    }
  }, [restRemaining, resting, restKey, voiceStatus]);

  // Opening the screen is what "restored" means — the MiniSessionBar hides again.
  useEffect(() => {
    session.restore();
  }, []);

  // The LiveKit connection can drop on its own (confirmed live: a ping timeout silently ate a
  // spoken set report). useVoiceSession auto-retries once; these just make that visible instead
  // of leaving a dead-looking orb with no explanation for why nothing got logged.
  useEffect(() => {
    if (reconnecting) session.announce("Voice connection dropped — reconnecting…");
  }, [reconnecting]);

  useEffect(() => {
    if (voiceDropped) session.announce("Voice disconnected. Tap to talk and repeat your last set.");
  }, [voiceDropped]);

  useEffect(() => {
    if (idleClosed) session.announce("Ended the call — you'd gone quiet for a while. Tap to talk again.");
  }, [idleClosed]);

  // Minimizing intentionally keeps voice running (handleMinimize) — but any other way this
  // screen goes away (ending the workout, a forced navigation, a crash-recovery unmount) must
  // not leave the mic silently listening. `session.minimized` is set true by handleMinimize and
  // reset to false by clear() (which every true-exit path calls first), so it's the one signal
  // that reliably tells them apart at unmount time.
  const minimizedRef = useRef(session.minimized);
  minimizedRef.current = session.minimized;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  useEffect(() => {
    return () => {
      if (!minimizedRef.current && isActiveRef.current) toggle();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ending a workout must end its voice conversation too, not just leave it running through the
  // post-workout feedback view — confirmed live: voice stayed connected there with nothing left
  // to talk about. Minimizing an in-progress session still deliberately keeps voice alive
  // (handleMinimize); this only fires once the session has actually ended.
  useEffect(() => {
    if (ended && isActiveRef.current) toggleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  const currentSetCount = loggedSets[currentExerciseIndex]?.length ?? 0;
  const parsedDraft = parseSetReport(draft);

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
            onManageTap={() => setManageOpen(true)}
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

      <ManageSessionSheet
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        userId={session.userId}
        isCardio={isCardio}
        exercises={exercises}
        currentExerciseIndex={currentExerciseIndex}
        onRemove={removeQueuedExercise}
        onSwap={swapQueuedExercise}
        onSwitchWorkout={() => {
          setManageOpen(false);
          setSwitchOpen(true);
        }}
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
