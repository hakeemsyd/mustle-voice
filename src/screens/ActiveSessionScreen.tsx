import React, { useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import { useRestRemaining } from "../hooks/useRestRemaining";
import { ConfirmSheet } from "../components/ConfirmSheet";
import { GuideSheet } from "../components/GuideSheet";
import { SessionControlsMenu } from "../components/SessionControlsMenu";
import { PostWorkoutFeedback } from "../components/PostWorkoutFeedback";
import { SessionChatThread } from "../components/session-chat/SessionChatThread";
import { ChatChipRow, type ChatChip } from "../components/session-chat/ChatChipRow";
import { CollapsibleSessionCard } from "../components/session-chat/CollapsibleSessionCard";
import { SessionVoiceInputDock } from "../components/session-chat/SessionVoiceInputDock";
import { CARDIO_ACTIVITIES } from "../components/SwitchWorkoutSheet";
import { formatClock } from "../lib/formatClock";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useSharedVoiceSession } from "../session/VoiceSessionProvider";
import { SYSTEM_CUE_PREFIX } from "../hooks/useVoiceSession";
import { useActiveSessionContext, type SessionTarget } from "../session/ActiveSessionContext";
import { usePlanAlternatives } from "../hooks/usePlanAlternatives";
import { getSwapCandidates, type SwapCandidate } from "../session/exerciseSwap";
import { supabase } from "../lib/supabase";
import { colors, fonts, sessionColors } from "../constants/theme";
import { BookOpenIcon, CalendarIcon, PlayIcon } from "../icons";
import { BackIcon } from "../icons/BackIcon";
import { CheckIcon } from "../icons/CheckIcon";
import { DumbbellIcon } from "../icons/DumbbellIcon";
import { SettingsIcon } from "../icons/SettingsIcon";
import { StopIcon } from "../icons/StopIcon";
import { MoreHorizontalIcon } from "../icons/MoreHorizontalIcon";
import {
  describeParsedSet,
  looksLikeSetReport,
  looksLikeStartSetCommand,
  parseSetReport,
} from "../lib/parseSetReport";
import { buildLiveSessionSnapshot, describeLiveSessionSnapshot } from "../session/liveSessionState";
import { chooseRestDay } from "../lib/restDay";
import { targetRepsFrom } from "../lib/restSuggestion";
import { titleCase } from "../lib/textFormat";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "ActiveSession">;

type ChipsState =
  | { kind: "idle" }
  | { kind: "gear-menu" }
  | { kind: "change-target" }
  | { kind: "change-pick"; exerciseRowId: string; exerciseName: string; candidates: SwapCandidate[] }
  | { kind: "remove-target" }
  | { kind: "switch-pick" }
  // Cardio has no Preview screen to route through (it isn't backed by a plan_session_id the
  // way a strength alternate is), so it gets its own explicit one-more-tap confirmation here
  // instead — never silently becomes the running session off a single chip pick.
  | { kind: "switch-confirm-cardio"; activity: string };

export function ActiveSessionScreen({ navigation }: Props) {
  const insets = useScreenInsets();
  const session = useActiveSessionContext();

  const [draft, setDraft] = useState("");
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [inputHint, setInputHint] = useState(false);
  const [undoVisible, setUndoVisible] = useState(false);
  const [chatChips, setChatChips] = useState<ChipsState>({ kind: "idle" });
  const [cardCollapsed, setCardCollapsed] = useState(true);
  // Mic-first: this screen auto-connects on focus and the whole point is reporting sets by
  // voice, so it lands on the speak surface rather than an open keyboard composer.
  const [inputMode, setInputMode] = useState<"mic" | "keyboard">("mic");
  const [swipeWidth, setSwipeWidth] = useState(0);
  const [expandedWidth, setExpandedWidth] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const chipScrollRef = useRef<ScrollView>(null);
  const expandedScrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const inputHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    target, loading, error, focus, exercises, currentExercise, currentExerciseIndex,
    loggedSets, resting, restKey, restTargetSec, restEndAt, restPausedRemainingSec,
    ended, endedStatus, saving, hasLoggedAnySet,
    coachThinking, elapsedSec, paused,
    removeQueuedExercise, swapQueuedExercise,
  } = session;

  const isCardio = target?.type === "cardio";

  // The exercise strip is a horizontally-paged ScrollView with no scroll-position binding of its
  // own — confirmed live: finishing the last set of an exercise advances currentExerciseIndex (the
  // card's own data correctly re-renders "COMPLETED" on the old exercise) but the scroll offset
  // itself never moves, so the screen keeps showing whatever page the user happened to be
  // scrolled to until they swipe manually. Both the collapsed strip and the expanded view need
  // this, since either can be the visible one when the index changes.
  //
  // Confirmed live: depending on swipeWidth/expandedWidth here (instead of just reading them at
  // call time) caused a real infinite render loop — scrollTo() on a paging ScrollView can itself
  // re-fire onLayout, which unconditionally calls setSwipeWidth/setExpandedWidth even when the
  // width hasn't actually changed, producing a new render that re-ran this very effect, which
  // called scrollTo again, forever. Refs break that cycle: the effect now only re-runs when the
  // exercise actually changes, and reads whatever width is current at that moment.
  const swipeWidthRef = useRef(0);
  swipeWidthRef.current = swipeWidth;
  const expandedWidthRef = useRef(0);
  expandedWidthRef.current = expandedWidth;

  useEffect(() => {
    if (isCardio) return;
    // Confirmed live: a single attempt right when the index changes could silently no-op if the
    // relevant ScrollView's width hadn't been measured yet at that exact moment (e.g. right after
    // toggling collapsed/expanded) — nothing retried it afterward, so the screen was left showing
    // an older exercise, correctly marked "COMPLETED", instead of the one actually current. Only
    // one of swipeWidth/expandedWidth is ever populated at a time (whichever card state is
    // actually mounted), so this retries until EITHER succeeds, not both.
    let cancelled = false;
    let attempts = 0;
    const tryScroll = () => {
      if (cancelled) return;
      attempts += 1;
      let scrolled = false;
      if (swipeWidthRef.current > 0) {
        chipScrollRef.current?.scrollTo({ x: currentExerciseIndex * swipeWidthRef.current, animated: true });
        scrolled = true;
      }
      if (expandedWidthRef.current > 0) {
        expandedScrollRef.current?.scrollTo({ x: currentExerciseIndex * expandedWidthRef.current, animated: true });
        scrolled = true;
      }
      if (!scrolled && attempts < 20) setTimeout(tryScroll, 100);
    };
    tryScroll();
    return () => {
      cancelled = true;
    };
  }, [currentExerciseIndex, isCardio]);

  const restRemaining = useRestRemaining(restEndAt, restPausedRemainingSec);
  const currentSetCount = loggedSets[currentExerciseIndex]?.length ?? 0;
  const nextExerciseName = exercises[currentExerciseIndex + 1]?.name ?? null;
  // Plan data only carries a load *scheme* ("%1RM", "RPE 8"), never a number, so the collapsed
  // row shows the weight actually lifted this exercise once there is one and falls back to the
  // scheme until then.
  const lastLoggedWeight = [...(loggedSets[currentExerciseIndex] ?? [])]
    .reverse()
    .find((set) => set.weight !== null)?.weight;
  const currentWeightLabel =
    lastLoggedWeight != null
      ? `${lastLoggedWeight} KG`
      : (currentExercise?.loadScheme ?? "—");
  const { alternatives: switchAlternatives } = usePlanAlternatives(
    target?.type === "strength" ? target.planSessionId : undefined,
  );

  const commitSet = (weight: number | null, reps: number, viaVoice = false, unit?: "seconds") => {
    session.logSet(weight, reps, unit);
    session.noteSetLogged(describeParsedSet({ weight, reps, unit }));
    setDraft("");
    // Recorded, not fired here — the "set_logged" cue needs the live_session_state write for
    // THIS set to land first (see the effect below), and that write hasn't even been scheduled
    // yet this synchronously, logSet's state update hasn't committed. viaVoice sets are
    // deliberately excluded: the coach already knows about those from its own inline context
    // update a few lines up in the message handler.
    pendingSetCueRef.current = viaVoice ? "skip" : "fire";

    setUndoVisible(true);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setUndoVisible(false), 8000);
  };

  const sendContextRef = useRef<((text: string) => void) | null>(null);
  const triggerCueRef = useRef<((cue: string) => void) | null>(null);
  const pendingSetCueRef = useRef<"fire" | "skip" | null>(null);

  const {
    orbState, isActive, status: voiceStatus, toggle, sendContextualUpdate, sendUserMessage,
    reconnecting, voiceDropped, idleClosed, connect, isMuted, toggleMute,
    setMessageHandler, setSessionConfig,
  } = useSharedVoiceSession();

  // Claims the shared conversation on focus. Two jobs: open the mic on arrival, and cancel the
  // pending release the screen we came from (Session Preview) scheduled on its way out, so the
  // hand-off carries one continuous call rather than a close-then-redial. Deliberately no
  // release on blur — a running workout keeps voice alive while minimized, and Home's orb is
  // where you stop it.
  useFocusEffect(
    React.useCallback(() => {
      connect();
    }, [connect]),
  );

  useEffect(() => {
    setMessageHandler((message) => {
      if (!message.text.startsWith(SYSTEM_CUE_PREFIX)) {
        session.appendMessage(message.role === "user" ? "user" : "coach", message.text);
      }
      // Checked before the rest guard below: during rest this is the one thing the user can say
      // that must still act on the session, and it's what makes "let's go / next set / start
      // set 3" actually clear the timer instead of waiting on a tool call that may never come.
      if (message.role === "user" && !isCardio && resting && looksLikeStartSetCommand(message.text)) {
        session.finishRest();
        try {
          // They asked to go, out loud, so this is the one moment that most needs a real spoken
          // prompt — confirmed live: the coach answered "Start set two" with the word "Silence",
          // reading the stay-quiet-through-rest briefing as still in force. Spelling out the exact
          // numbers it should say is what makes it coach here instead of going quiet or reaching
          // for a template.
          const setNumber = currentSetCount + 1;
          sendContextRef.current?.(
            `The user just asked to start the next set out loud, so the app ended their rest early ` +
              `and the timer is cleared. Rest is over. Answer them — going quiet here is wrong, they ` +
              `just spoke to you. Give them the real next-set prompt: this is set ${setNumber}` +
              `${currentExercise ? ` of ${currentExercise.sets} for ${currentExercise.name}` : ""}, ` +
              `${currentExercise ? `target ${currentExercise.repScheme} reps` : "the target reps"}` +
              `${lastLoggedWeight != null ? ` at ${lastLoggedWeight}kg, the same weight as their last set` : ""}. ` +
              `One short line, natural, then let them lift.`,
          );
        } catch (err) {
          console.error("[active session] failed to tell coach rest was skipped:", err);
        }
        return;
      }
      if (message.role !== "user" || isCardio || (resting && restRemaining > 0)) return;
      if (!looksLikeSetReport(message.text)) return;
      const parsed = parseSetReport(message.text);
      if (!parsed) {
        // The single biggest source of coach/app drift: the user reports a set, the coach hears
        // and counts it conversationally, but the local parser can't read the numbers out of it
        // — and this used to `return` silently. The app stayed on set N while the coach believed
        // N was done, and the two never reconciled for the rest of the exercise. Telling the
        // coach nothing was recorded is what keeps the two counts on the same page.
        try {
          sendContextRef.current?.(
            `IMPORTANT: that sounded like a set report, but the app could NOT read a weight and rep ` +
              `count out of it, so NOTHING was logged. The app is still waiting on set ` +
              `${currentSetCount + 1}${currentExercise ? ` of ${currentExercise.sets} for ${currentExercise.name}` : ""}. ` +
              `Do not count that set or move on — ask them once, briefly, for the weight and reps.`,
          );
        } catch (err) {
          console.error("[active session] failed to tell coach a set report failed to parse:", err);
        }
        return;
      }
      // A bare "eight reps" follow-up (no weight repeated) reads as bodyweight to the parser,
      // silently dropping a real weight already established earlier for this exercise — confirmed
      // live: answering the app's own "How many reps?" clarifying question with reps only logged
      // 60kg as bodyweight. Carry forward the last weight actually logged for this exercise
      // instead of trusting "no weight mentioned this sentence" as "true bodyweight movement".
      const resolvedWeight =
        parsed.weight === null && parsed.unit !== "seconds" ? (lastLoggedWeight ?? null) : parsed.weight;
      const parsedForLog = { ...parsed, weight: resolvedWeight };
      commitSet(parsedForLog.weight, parsedForLog.reps, true, parsedForLog.unit);
      const setNumber = currentSetCount + 1;
      // A voice-reported set is logged and acknowledged entirely through this inline context
      // update, never through the set_logged/exercise_advanced cue system below (that's
      // deliberately skipped for viaVoice sets — see commitSet's own comment). That means THIS
      // message is the only place the model can learn a transition happened at all. It used to
      // only ever describe the set that was just finished — confirmed live: when that set was
      // the exercise's last one, the model was never told a new exercise had started, so it kept
      // narrating the OLD exercise's rep scheme and set count indefinitely (a fictional "set
      // four" on a 3-set exercise, the wrong rep range) since nothing ever corrected it.
      const exerciseComplete = !!currentExercise && setNumber >= (currentExercise.sets ?? 0);
      const nextExercise = exerciseComplete ? (exercises[currentExerciseIndex + 1] ?? null) : null;
      // Moving to a new exercise is the one moment the coach MUST speak, and a contextual update
      // can't make it: it reaches the model without demanding a reply, so it only ever got
      // announced when it happened to land before that turn finished generating. Confirmed live:
      // two of three transitions in one workout were never announced — "Rest." and then nothing,
      // while the screen had already moved on. Re-arming the cue (voice-reported sets normally skip
      // it) routes this through exercise_advanced instead, which is sent as a turn and is therefore
      // always answered. The contextual update below is skipped in that case so the transition is
      // announced exactly once, by the cue.
      const handOffToCue = exerciseComplete && !!nextExercise;
      if (handOffToCue) pendingSetCueRef.current = "fire";
      // describeParsedSet is unit-aware ("52s held" vs "60kg × 8 reps") — this used to hardcode
      // "× N reps" regardless, so a timed hold (Plank, etc.) told the coach a rep count that was
      // actually a duration, and it would confirm "52 reps" out loud for a 52-second hold.
      if (handOffToCue) return;
      try {
        sendContextRef.current?.(
          `The app just logged this set directly from what the user said: ${currentExercise?.name ?? "the current exercise"}, ` +
            `set ${setNumber}${currentExercise ? ` of ${currentExercise.sets}` : ""}, ${describeParsedSet(parsedForLog)}. ` +
            `It's already recorded — don't ask what exercise it was, whether they've done it before, or ask them to confirm ` +
            `any of these details, and if they say it was wrong or misheard, call undo_last_set instead of just apologizing ` +
            `in text. Acknowledge in one short sentence and move the conversation forward.` +
            (exerciseComplete
              ? nextExercise
                ? ` That was the last set of ${currentExercise!.name} — the app has already moved on to the next ` +
                  `exercise: ${nextExercise.name}, ${nextExercise.sets} sets of ${nextExercise.repScheme}` +
                  `${nextExercise.loadScheme ? ` at ${nextExercise.loadScheme}` : ""}. There is no rest timer between ` +
                  `exercises, so name the new exercise and its real target next — these exact numbers, never ` +
                  `${currentExercise!.name}'s.`
                : ` That was the last set of the last exercise — the workout is complete. Wrap it up; don't reference ` +
                  `another set or exercise.`
              : ""),
        );
      } catch (err) {
        console.error("[active session] failed to send set-logged context to voice:", err);
      }
    });
    setSessionConfig({
      userId: session.userId,
      dynamicVariables: {
        user_name: session.userName ?? "there",
        user_id: session.userId ?? "",
        user_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCardio, resting, restRemaining, currentExercise, currentSetCount, session.userId, session.userName]);

  useEffect(() => {
    sendContextRef.current = sendContextualUpdate;
  }, [sendContextualUpdate]);

  const liveStateWriteRef = useRef<PromiseLike<unknown>>(Promise.resolve());

  useEffect(() => {
    triggerCueRef.current = (cue: string) => {
      if (voiceStatus !== "connected") return;
      try {
        sendUserMessage(`${SYSTEM_CUE_PREFIX} ${cue}`);
      } catch (err) {
        console.error("[active session] failed to send coach cue:", err);
      }
    };
  }, [voiceStatus, sendUserMessage]);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

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

  useEffect(() => {
    // Once ended, session.endSession() has already deleted this row outright (see
    // ActiveSessionContext.tsx) so the coach sees no session at all rather than a stale one —
    // re-upserting here on the very same ended:false→true transition would race that delete and
    // could leave the row behind again, exactly the bug this was meant to close.
    if (!session.userId || !target || ended) return;
    liveStateWriteRef.current = supabase.from("live_session_state").upsert({
      user_id: session.userId,
      state: {
        // Scopes the coach's replayed conversation to THIS workout (see brain-voice's prepareTurn).
        // The session survives leaving the screen — Home's in-progress card comes back to the same
        // in-memory session — so the coach should still remember the weight they were told. Killing
        // the app wipes that state and starts a new session with a new stamp, so the coach forgets
        // exactly what the UI forgot, instead of insisting they're on set 3 of a workout the screen
        // has restarted from zero.
        startedAt: session.startedAt,
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
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.userId, target, focus, exercises, currentExerciseIndex, loggedSets, resting, restTargetSec, restPausedRemainingSec, paused, ended]);

  const greetedSessionRef = useRef<typeof target>(null);
  useEffect(() => {
    if (!target || ended || voiceStatus !== "connected") return;
    if (!isCardio && !currentExercise) return;
    if (greetedSessionRef.current === target) return;
    greetedSessionRef.current = target;
    // Either outcome sends the cue: a failed live_session_state write is worth greeting through
    // anyway (session_start's own wording falls back to a generic hello when no state block
    // reaches the model), whereas skipping it would leave the user in silence.
    void liveStateWriteRef.current.then(
      () => triggerCueRef.current?.("session_start"),
      () => triggerCueRef.current?.("session_start"),
    );
  }, [target, ended, voiceStatus, isCardio, currentExercise]);

  // Same race as session_start, just tighter: commitSet fires synchronously, before logSet's own
  // state update has even committed, let alone before the write effect above has re-run for the
  // new loggedSets/resting values — so "set_logged" can't just await liveStateWriteRef.current
  // right there. Deferring the trigger into its own effect, declared after the write effect,
  // means both react to the same loggedSets change in the same commit: the write effect (earlier
  // in source order) reassigns liveStateWriteRef.current first, then this one reads the fresh
  // promise, same guarantee session_start already has.
  const totalSetsLogged = loggedSets.reduce((n, sets) => n + sets.length, 0);
  const lastSetCueCountRef = useRef(totalSetsLogged);
  useEffect(() => {
    if (totalSetsLogged === lastSetCueCountRef.current) return;
    lastSetCueCountRef.current = totalSetsLogged;
    const pending = pendingSetCueRef.current;
    pendingSetCueRef.current = null;
    if (pending !== "fire") return;
    // set_logged's wording ("rest has started") is only true when a rest period actually began —
    // the set that just finished an exercise (advancing to a new one, or ending the workout) never
    // starts one. resting/ended already reflect the post-commit state by the time this re-runs
    // (same render as totalSetsLogged), so they're enough to tell the three outcomes apart without
    // any new state: still resting -> set_logged is accurate; ended -> the workout-complete flow
    // handles its own acknowledgment, nothing to cue here; neither -> the exercise just advanced
    // with no rest, which needs exercise_advanced's different wording instead.
    if (ended) return;
    const cue = resting ? "set_logged" : "exercise_advanced";
    void liveStateWriteRef.current.then(
      () => triggerCueRef.current?.(cue),
      () => triggerCueRef.current?.(cue),
    );
  }, [totalSetsLogged, resting, ended]);

  // Rest has to end itself. Nothing called finishRest except the expanded card's Continue
  // button, so a finished rest sat at 0:00 forever and the next set could never begin.
  // Deliberately independent of voice status — the timer must advance whether or not a call is
  // connected.
  useEffect(() => {
    if (!resting || restPausedRemainingSec !== null || restRemaining > 0) return;
    session.finishRest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resting, restRemaining, restPausedRemainingSec]);

  // The agent had no idea a rest timer was running: `set_logged` told it to say rest had
  // started, but not how long for or to then stay quiet — so it filled the silence, and every
  // prompt it made invited a reply, which kept the loop going all through the rest period.
  // Sent as a contextual update rather than a cue on purpose: a cue goes in as a user turn and
  // demands a response, which is the opposite of what's wanted here.
  const restBriefedKeyRef = useRef(-1);
  useEffect(() => {
    if (!resting || voiceStatus !== "connected") return;
    if (restBriefedKeyRef.current === restKey) return;
    restBriefedKeyRef.current = restKey;
    const seconds = restPausedRemainingSec ?? restTargetSec;
    try {
      sendContextRef.current?.(
        `The app just started a ${seconds}-second rest timer and is showing it on screen. Do not ` +
          `speak again until the app tells you rest is over — no check-ins, no "ready when you are", ` +
          `no asking them to start the next set. The app will tell you the moment rest ends. If the ` +
          `user speaks to you first, answer them normally, but otherwise stay silent.`,
      );
    } catch (err) {
      console.error("[active session] failed to brief coach on rest start:", err);
    }
  }, [resting, restKey, restTargetSec, restPausedRemainingSec, voiceStatus]);

  // silenceCount: 0 = no check-in sent yet, 1 = the casual first nudge fired, 2 = the final,
  // more direct one fired — capped there per Damion's spec ("prompt once and follow up once
  // later, then wait"), not the single check-in this used to cap at.
  const restCueStateRef = useRef({ key: -1, countdown: false, over: false, silenceCount: 0 });
  const restingRef = useRef(resting);
  restingRef.current = resting;
  useEffect(() => {
    if (restCueStateRef.current.key !== restKey) {
      restCueStateRef.current = { key: restKey, countdown: false, over: false, silenceCount: 0 };
    }
  }, [restKey]);

  const SILENCE_CHECKIN_DELAY_MS = 20_000;

  useEffect(() => {
    if (!resting || voiceStatus !== "connected") return;
    const state = restCueStateRef.current;
    if (state.key !== restKey) return;
    if (restRemaining <= 0 && !state.over) {
      state.over = true;
      // Same live_session_state race as set_logged/session_start — the coach reads the next
      // exercise/set number off this row when told rest is over.
      void liveStateWriteRef.current.then(
        () => triggerCueRef.current?.("rest_over"),
        () => triggerCueRef.current?.("rest_over"),
      );

      const scheduleCheckIn = () => {
        setTimeout(() => {
          const s = restCueStateRef.current;
          if (s.key !== restKey || !restingRef.current) return;
          if (s.silenceCount === 0) {
            s.silenceCount = 1;
            triggerCueRef.current?.("silence_after_rest");
            scheduleCheckIn();
          } else if (s.silenceCount === 1) {
            s.silenceCount = 2;
            triggerCueRef.current?.("silence_after_rest_final");
          }
        }, SILENCE_CHECKIN_DELAY_MS);
      };
      scheduleCheckIn();
    } else if (restRemaining > 0 && restRemaining <= 10 && !state.countdown) {
      state.countdown = true;
      void liveStateWriteRef.current.then(
        () => triggerCueRef.current?.("rest_final_countdown"),
        () => triggerCueRef.current?.("rest_final_countdown"),
      );
    }
  }, [restRemaining, resting, restKey, voiceStatus]);

  useEffect(() => {
    session.restore();
  }, []);

  useEffect(() => {
    if (reconnecting) session.announce("Voice connection dropped — reconnecting…");
  }, [reconnecting]);

  useEffect(() => {
    if (voiceDropped) session.announce("Voice disconnected. Tap to talk and repeat your last set.");
  }, [voiceDropped]);

  useEffect(() => {
    if (idleClosed) session.announce("Ended the call — you'd gone quiet for a while. Tap to talk again.");
  }, [idleClosed]);

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

  useEffect(() => {
    if (ended && isActiveRef.current) toggleRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended]);

  const parsedDraft = parseSetReport(draft);

  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    if (!isCardio && !resting && looksLikeSetReport(text)) {
      const parsed = parseSetReport(text);
      if (parsed) {
        commitSet(parsed.weight, parsed.reps, false, parsed.unit);
        return;
      }
    }
    setDraft("");
    void session.askCoach(text);
  };

  const handleDoneSet = () => {
    if (resting || !currentExercise) return;
    if (parsedDraft) {
      commitSet(parsedDraft.weight, parsedDraft.reps, false, parsedDraft.unit);
      return;
    }
    // Tapped straight from the menu with nothing typed — confirmed live: this used to silently
    // no-op (just focus the input), which read as the button doing nothing at all. Falls back to
    // the exercise's own target reps and whatever weight was last logged for it this session
    // (null/bodyweight if this is the first set) so the tap always records something real,
    // instead of only working when the user has already typed a report.
    const fallbackReps = targetRepsFrom(currentExercise.repScheme);
    if (fallbackReps != null) {
      commitSet(lastLoggedWeight ?? null, fallbackReps, false);
      return;
    }
    inputRef.current?.focus();
    setInputHint(true);
    if (inputHintTimerRef.current) clearTimeout(inputHintTimerRef.current);
    inputHintTimerRef.current = setTimeout(() => setInputHint(false), 4000);
  };

  const handleUndoLastSet = () => {
    setUndoVisible(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    session.undoLastSet();
    session.announce("Undone — that set wasn't logged.");
  };

  const handleMinimize = () => {
    session.minimize();
    navigation.goBack();
  };

  const confirmEnd = async () => {
    setEndConfirmOpen(false);
    if (!isCardio && !hasLoggedAnySet) {
      closeOut();
      return;
    }
    await session.endSession(isCardio ? "completed" : "partial");
  };

  const closeOut = () => {
    const workoutLogId = session.workoutLogId;
    const sessionMessages = session.messages;
    session.clear();
    if (workoutLogId) {
      navigation.replace("SessionReport", { workoutLogId, sessionMessages });
    } else {
      navigation.goBack();
    }
  };

  const handleRestDay = async () => {
    const deferredPlanSessionId = target?.type === "strength" ? target.planSessionId : null;
    const userId = session.userId;
    await session.resolveOutgoingSession();
    if (userId) await chooseRestDay(userId, deferredPlanSessionId);
    session.clear();
    navigation.goBack();
  };

  // Switching used to call session.start() straight from the chip pick — a single tap silently
  // became a running session with no exercise list shown and no explicit Start Session tap.
  // Confirmed live (Damion): picking "Lower Body" mid-Upper-Pull immediately opened an active
  // Back Squat session with nothing previewed. A strength alternate now routes through the real
  // Preview screen instead — persist the outgoing partial exactly like handleRestDay already
  // does, clear out of the active session entirely (not start a new one), then let Preview's own
  // intro/exercise-list/Start Session do what it already does everywhere else in the app.
  const handleSwitchToPreview = async (planSessionId: string) => {
    await session.resolveOutgoingSession();
    session.clear();
    navigation.replace("PreWorkoutPreview", { planSessionId });
  };

  const handleSwitchConfirm = (next: SessionTarget) => {
    const switchedFrom = target?.type === "strength" ? target.planSessionId : undefined;
    session.start({ ...next, switchedFromSessionId: switchedFrom } as SessionTarget);
  };

  const resetChips = () => setChatChips({ kind: "idle" });

  const upcomingExercises = exercises.slice(currentExerciseIndex + 1);

  const handleChipPick = async (label: string) => {
    if (label === "Cancel") {
      resetChips();
      return;
    }

    if (chatChips.kind === "gear-menu") {
      if (label === "Change Exercise") {
        session.announce("Which upcoming exercise would you like to change?");
        setChatChips({ kind: "change-target" });
      } else if (label === "Remove Exercise") {
        session.announce("Which upcoming exercise should I remove?");
        setChatChips({ kind: "remove-target" });
      } else if (label === "Change Workout") {
        session.announce("Which workout would you like instead?");
        setChatChips({ kind: "switch-pick" });
      }
      return;
    }

    if (chatChips.kind === "change-target") {
      const exercise = upcomingExercises.find((e) => e.name === label);
      if (!exercise || !session.userId) return;
      session.announce("One sec — checking safe alternates…");
      const candidates = await getSwapCandidates(session.userId, exercise.exerciseId);
      if (candidates.length === 0) {
        session.announce("No safe alternates found for that one.");
        resetChips();
        return;
      }
      setChatChips({ kind: "change-pick", exerciseRowId: exercise.id, exerciseName: exercise.name, candidates });
      return;
    }

    if (chatChips.kind === "change-pick") {
      const candidate = chatChips.candidates.find((c) => c.name === label);
      if (!candidate) return;
      swapQueuedExercise(chatChips.exerciseRowId, candidate);
      session.announce(`Swapped ${chatChips.exerciseName} for ${candidate.name}.`);
      resetChips();
      return;
    }

    if (chatChips.kind === "remove-target") {
      const exercise = upcomingExercises.find((e) => e.name === label);
      if (!exercise) return;
      removeQueuedExercise(exercise.id);
      session.announce(`Removed ${exercise.name} from this session.`);
      resetChips();
      return;
    }

    if (chatChips.kind === "switch-pick") {
      if (label === "Take a Rest Day") {
        resetChips();
        void handleRestDay();
        return;
      }
      const alt = switchAlternatives.find((a) => titleCase(a.focus) === label);
      if (alt) {
        resetChips();
        session.announce(`Switching to ${titleCase(alt.focus)} — pulling up the exercises now.`);
        void handleSwitchToPreview(alt.planSessionId);
        return;
      }
      if ((CARDIO_ACTIVITIES as readonly string[]).includes(label)) {
        session.announce(
          `${label} is a timer-based session — nothing from ${
            focus ? titleCase(focus) : "today's workout"
          } is lost, it's saved as-is. Start it now?`,
        );
        setChatChips({ kind: "switch-confirm-cardio", activity: label });
      }
      return;
    }

    if (chatChips.kind === "switch-confirm-cardio" && label === "Start") {
      resetChips();
      handleSwitchConfirm({ type: "cardio", activity: chatChips.activity });
    }
  };

  const chipsForState: ChatChip[] =
    chatChips.kind === "gear-menu"
      ? [{ label: "Change Exercise" }, { label: "Remove Exercise" }, { label: "Change Workout" }, { label: "Cancel" }]
      : chatChips.kind === "change-target" || chatChips.kind === "remove-target"
        ? upcomingExercises.length === 0
          ? [{ label: "Cancel" }]
          : [...upcomingExercises.map((e) => ({ label: e.name })), { label: "Cancel" }]
        : chatChips.kind === "change-pick"
          ? [...chatChips.candidates.map((c) => ({ label: c.name })), { label: "Cancel" }]
          : chatChips.kind === "switch-pick"
            ? [
                { label: "Take a Rest Day" },
                ...switchAlternatives.map((a) => ({ label: titleCase(a.focus) })),
                ...CARDIO_ACTIVITIES.map((activity) => ({ label: activity })),
                { label: "Cancel" },
              ]
            : chatChips.kind === "switch-confirm-cardio"
              ? [{ label: "Start", primary: true }, { label: "Cancel" }]
              : [];

  const showBars = !loading && !error && !ended && (isCardio || exercises.length > 0);
  const cardBackground = resting ? sessionColors.rest : sessionColors.active;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* One mono label, no big exercise title — the yellow card below already names the
          current exercise, and repeating it in the header was the design's own reason for
          dropping it. Both side slots are the same fixed width so the label stays centred. */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerSide}>
          <Pressable onPress={handleMinimize} hitSlop={12}>
            <BackIcon size={22} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>
        <Text style={styles.headerLabel}>ACTIVE WORKOUT</Text>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          {!isCardio && currentExercise && !ended && (
            <>
              <Pressable style={styles.iconBtn} onPress={() => setGuideOpen(true)} hitSlop={8}>
                <BookOpenIcon size={15} color={colors.text} />
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => navigation.navigate("Calendar", { initialScope: "today" })}
                hitSlop={8}
              >
                <CalendarIcon size={15} color={colors.text} />
              </Pressable>
            </>
          )}
        </View>
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
            <SessionChatThread messages={session.messages} typing={coachThinking} />
          </View>
        </TouchableWithoutFeedback>
      )}

      {showBars && (
        <>
          {undoVisible && (
            <Pressable style={styles.undoPill} onPress={handleUndoLastSet}>
              <Text style={styles.undoPillText}>Wrong? Undo last set</Text>
            </Pressable>
          )}

          <CollapsibleSessionCard
            collapsed={cardCollapsed}
            collapsedHeight={60}
            expandedHeight={284}
            backgroundColor={cardBackground}
            onPress={() => setCardCollapsed((c) => !c)}
          >
            {cardCollapsed && (
              <View style={styles.collapsedRow}>
                {/* One page per exercise, paged by the strip's own width so a swipe moves
                    cleanly from one to the next. Only the current page carries the
                    label/value readout; the others are inert previews. */}
                <ScrollView
                  ref={chipScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.chipSwipe}
                  onLayout={(e) => setSwipeWidth(e.nativeEvent.layout.width)}
                >
                  {isCardio ? (
                    <View style={[styles.chipSlide, swipeWidth ? { width: swipeWidth } : null]}>
                      <View style={styles.chipInfoRow}>
                        <View style={styles.chipInfoColExercise}>
                          <Text style={styles.chipInfoLabelTag}>CARDIO</Text>
                          <Text style={styles.chipInfoValue} numberOfLines={1}>
                            {(target?.type === "cardio" ? target.activity : "Cardio").toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.chipDivider} />
                        <View style={styles.chipInfoCol}>
                          <Text style={styles.chipInfoLabel}>ELAPSED</Text>
                          <Text style={styles.chipInfoValueSmall}>{formatClock(elapsedSec)}</Text>
                        </View>
                      </View>
                    </View>
                  ) : (
                    exercises.map((exercise, i) => {
                      const slideWidth = swipeWidth ? { width: swipeWidth } : null;

                      if (i === currentExerciseIndex) {
                        return (
                          <Pressable
                            key={exercise.id}
                            style={[styles.chipSlide, slideWidth]}
                            onPress={() => setCardCollapsed(false)}
                          >
                            {resting ? (
                              <View style={styles.chipRestRow}>
                                <Text style={styles.chipRestCounter}>{formatClock(restRemaining)}</Text>
                                <View style={styles.chipDivider} />
                                <View style={styles.chipRestNextGroup}>
                                  <Text style={styles.chipInfoLabelTag}>NEXT</Text>
                                  <Text style={styles.chipInfoValue} numberOfLines={1}>
                                    {currentSetCount >= (exercise.sets ?? 0) && nextExerciseName
                                      ? nextExerciseName.toUpperCase()
                                      : `SET ${currentSetCount + 1}`}
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <View style={styles.chipInfoRow}>
                                <View style={styles.chipInfoColExercise}>
                                  <Text style={styles.chipInfoLabelTag} numberOfLines={1}>
                                    EXERCISE
                                  </Text>
                                  <Text style={styles.chipInfoValue} numberOfLines={1}>
                                    {exercise.name.toUpperCase()}
                                  </Text>
                                </View>
                                <View style={styles.chipDivider} />
                                <View style={styles.chipInfoCol}>
                                  <Text style={styles.chipInfoLabel} numberOfLines={1}>
                                    SET
                                  </Text>
                                  <Text style={styles.chipInfoValueSmall} numberOfLines={1}>
                                    {Math.min(currentSetCount + 1, exercise.sets ?? 1)}/{exercise.sets ?? 1}
                                  </Text>
                                </View>
                                <View style={styles.chipDivider} />
                                <View style={styles.chipInfoCol}>
                                  <Text style={styles.chipInfoLabel} numberOfLines={1}>
                                    REPS
                                  </Text>
                                  <Text style={styles.chipInfoValueSmall} numberOfLines={1}>
                                    {exercise.repScheme ?? "—"}
                                  </Text>
                                </View>
                                <View style={styles.chipDivider} />
                                <View style={styles.chipInfoColWeight}>
                                  <Text style={styles.chipInfoLabel} numberOfLines={1}>
                                    WEIGHT
                                  </Text>
                                  <Text style={styles.chipInfoValueSmall} numberOfLines={1}>
                                    {currentWeightLabel}
                                  </Text>
                                </View>
                              </View>
                            )}
                          </Pressable>
                        );
                      }

                      const done = i < currentExerciseIndex;
                      return (
                        <View
                          key={exercise.id}
                          style={[styles.chipSlide, slideWidth, done && styles.chipSlideCompleted]}
                        >
                          <Text style={[styles.chipTag, done ? styles.chipTagCompleted : styles.chipTagUpcoming]}>
                            {done ? "COMPLETED" : "UPCOMING"}
                          </Text>
                          <View style={styles.chipSlideRow}>
                            <Text style={styles.chipExercise} numberOfLines={1}>
                              {exercise.name.toUpperCase()}
                            </Text>
                            {exercise.repScheme && (
                              <>
                                <View style={styles.chipDivider} />
                                <Text style={styles.chipMeta} numberOfLines={1}>
                                  {exercise.sets} × {exercise.repScheme}
                                </Text>
                              </>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </ScrollView>

                {/* One control, matching the design — opens the same change/remove/switch
                    menu the old gear icon did. */}
                <Pressable
                  style={styles.chipControlBtn}
                  onPress={() => setControlsOpen(true)}
                  hitSlop={8}
                >
                  <MoreHorizontalIcon size={16} color="#0A0A0A" />
                </Pressable>
              </View>
            )}

            {!cardCollapsed && (
              <View style={styles.expandedInner}>
                {/* Same paged strip as the collapsed row, laid out as full slides — swipe back
                    through what's done and forward through what's coming. Only the current
                    slide carries the live readout and collapses the card on tap. */}
                <ScrollView
                  ref={expandedScrollRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.expandedSwipe}
                  onLayout={(e) => setExpandedWidth(e.nativeEvent.layout.width)}
                >
                  {isCardio ? (
                    <View style={[styles.expandedSlide, expandedWidth ? { width: expandedWidth } : null]}>
                      <Text style={styles.exerciseName}>
                        {(target?.type === "cardio" ? target.activity : "Cardio").toUpperCase()}
                      </Text>
                      <View style={styles.targetCard}>
                        <Text style={styles.targetSetLabel}>ELAPSED</Text>
                        <Text style={styles.targetValue}>{formatClock(elapsedSec)}</Text>
                      </View>
                    </View>
                  ) : (
                    exercises.map((exercise, i) => {
                      const slideWidth = expandedWidth ? { width: expandedWidth } : null;

                      if (i !== currentExerciseIndex) {
                        const done = i < currentExerciseIndex;
                        return (
                          <View
                            key={`exp-${exercise.id}`}
                            style={[styles.expandedSlide, slideWidth, done && styles.expandedSlideCompleted]}
                          >
                            <Text style={[styles.chipTag, done ? styles.chipTagCompleted : styles.chipTagUpcoming]}>
                              {done ? "COMPLETED" : "UPCOMING"}
                            </Text>
                            <Text style={styles.exerciseName}>{exercise.name.toUpperCase()}</Text>
                            {exercise.repScheme && (
                              <Text style={styles.targetSub}>
                                {exercise.sets} × {exercise.repScheme}
                              </Text>
                            )}
                          </View>
                        );
                      }

                      return (
                        <Pressable
                          key={`exp-${exercise.id}`}
                          style={[styles.expandedSlide, slideWidth]}
                          onPress={() => setCardCollapsed(true)}
                        >
                          <Text style={styles.exerciseName}>{exercise.name.toUpperCase()}</Text>
                          <View style={styles.targetCard}>
                            {resting ? (
                              <>
                                <Text style={styles.targetSetLabel}>RESTING</Text>
                                {/* Counter centred with +10s pinned to the card's right edge —
                                    a three-slot row, so the number stays optically centred
                                    however wide the button is. */}
                                <View style={styles.restCounterRow}>
                                  <View style={styles.restCounterSpacer} />
                                  <Text style={styles.targetValue}>{formatClock(restRemaining)}</Text>
                                  <View style={styles.restCounterAction}>
                                    <Pressable
                                      style={styles.restAddBtn}
                                      onPress={() => session.extendRest(10, "manual")}
                                      hitSlop={8}
                                    >
                                      <Text style={styles.restAddText}>+10s</Text>
                                    </Pressable>
                                  </View>
                                </View>
                                <Text style={styles.nextSetChip}>
                                  {currentSetCount >= (exercise.sets ?? 0) && nextExerciseName
                                    ? `Next: ${nextExerciseName}`
                                    : `Next: Set ${currentSetCount + 1}`}
                                </Text>
                                <View style={styles.targetWeight}>
                                  <DumbbellIcon size={14} color="#0A0A0A" />
                                  <Text style={styles.targetWeightText}>{currentWeightLabel}</Text>
                                </View>
                              </>
                            ) : (
                              <>
                                <Text style={styles.targetSetLabel}>
                                  SET {Math.min(currentSetCount + 1, exercise.sets ?? 1)} OF {exercise.sets ?? 1}
                                </Text>
                                <Text style={styles.targetValue}>{exercise.repScheme ?? "—"}</Text>
                                <Text style={styles.targetSub}>TARGET REPS</Text>
                                <View style={styles.targetWeight}>
                                  <DumbbellIcon size={14} color="#0A0A0A" />
                                  <Text style={styles.targetWeightText}>{currentWeightLabel}</Text>
                                </View>
                              </>
                            )}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>

                <View style={styles.controlsRow}>
                  <View style={styles.controlsRowPrimary}>
                    {resting && !isCardio ? (
                      <Pressable style={styles.doneBtnSlim} onPress={session.finishRest}>
                        <PlayIcon size={13} color="#FFFFFF" />
                        <Text style={[styles.doneBtnText, styles.doneBtnTextRest]}>
                          Start Set {currentSetCount + 1}
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        style={[styles.doneBtnSlim, isCardio && styles.doneBtnSlimDisabled]}
                        onPress={handleDoneSet}
                        disabled={isCardio}
                      >
                        <CheckIcon size={14} color={sessionColors.active} />
                        <Text style={styles.doneBtnText}>Set done</Text>
                      </Pressable>
                    )}
                    <Pressable style={styles.workoutDoneBtn} onPress={() => setEndConfirmOpen(true)}>
                      <StopIcon size={11} color="#0A0A0A" />
                      <Text style={styles.workoutDoneText}>Workout done</Text>
                    </Pressable>
                  </View>
                  <Pressable
                    style={styles.iconGhostBtn}
                    onPress={() => {
                      session.announce("What would you like to change?");
                      setChatChips({ kind: "gear-menu" });
                    }}
                    hitSlop={8}
                  >
                    <SettingsIcon size={14} color="#0A0A0A" />
                  </Pressable>
                </View>
              </View>
            )}

          </CollapsibleSessionCard>

          {chatChips.kind !== "idle" && <ChatChipRow chips={chipsForState} onPick={handleChipPick} />}

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
            muted={isMuted}
            onToggleMute={toggleMute}
            parsePreview={
              !isCardio && parsedDraft
                ? describeParsedSet(parsedDraft)
                : inputHint
                  ? 'Type weight and reps here — e.g. "60kg 8 reps"'
                  : null
            }
          />
          </View>
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

      <SessionControlsMenu
        open={controlsOpen}
        onClose={() => setControlsOpen(false)}
        onSetDone={!isCardio && !resting ? handleDoneSet : undefined}
        onStartSet={!isCardio && resting ? session.finishRest : undefined}
        startSetLabel={`Start set ${currentSetCount + 1}`}
        onWorkoutDone={() => setEndConfirmOpen(true)}
        onManageWorkout={() => {
          session.announce("What would you like to change?");
          setChatChips({ kind: "gear-menu" });
        }}
      />

      <GuideSheet
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        exerciseId={currentExercise?.exerciseId ?? null}
        exerciseName={currentExercise?.name ?? null}
        repScheme={currentExercise?.repScheme}
        loadScheme={currentExercise?.loadScheme ?? undefined}
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
    paddingBottom: 14,
  },
  // 74px each side — wide enough for the two icon buttons on the right, and matched on the
  // left so the centre label is optically centred rather than pushed off by them.
  headerSide: {
    width: 74,
    flexDirection: "row",
    alignItems: "center",
  },
  headerSideRight: {
    justifyContent: "flex-end",
    gap: 6,
  },
  headerLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.54,
    color: colors.muted,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: {
    flex: 1,
  },

  // ── Expanded card ── literal black-on-yellow, same reasoning as the collapsed row.
  expandedInner: {
    flex: 1,
    justifyContent: "space-between",
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  expandedSwipe: {
    flex: 1,
    minHeight: 0,
    width: "100%",
  },
  expandedSlide: {
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  expandedSlideCompleted: {
    opacity: 0.55,
  },
  exerciseName: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.72,
    lineHeight: 19,
    textAlign: "center",
    color: "#0A0A0A",
  },
  // Full width, not shrink-to-fit: the rest row's +10s button has to be able to reach the
  // card's real right edge, which it can't if this column is only as wide as its widest line.
  targetCard: {
    width: "100%",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
    paddingBottom: 8,
  },
  targetSetLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.1,
    color: "#0A0A0A",
  },
  targetValue: {
    fontFamily: fonts.display,
    fontSize: 56,
    lineHeight: 56,
    color: "#0A0A0A",
  },
  targetSub: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: "#0A0A0A",
  },
  targetWeight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  targetWeightText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: "#0A0A0A",
  },
  restCounterRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  restCounterSpacer: {
    flex: 1,
  },
  restCounterAction: {
    flex: 1,
    alignItems: "flex-end",
  },
  restAddBtn: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  restAddText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    color: "rgba(0,0,0,0.65)",
  },
  nextSetChip: {
    overflow: "hidden",
    fontFamily: fonts.bodyBold,
    fontSize: 11.5,
    letterSpacing: 0.23,
    color: "#FFFFFF",
    backgroundColor: "#0A0A0A",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  controlsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  controlsRowPrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  // Black pill, not lime — a lime button would disappear into the card itself.
  doneBtnSlim: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: "#0A0A0A",
  },
  doneBtnSlimDisabled: {
    opacity: 0.35,
  },
  doneBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    letterSpacing: 0.25,
    color: sessionColors.active,
  },
  doneBtnTextRest: {
    color: "#FFFFFF",
  },
  workoutDoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.22)",
  },
  workoutDoneText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12.5,
    letterSpacing: 0.25,
    color: "#0A0A0A",
  },
  iconGhostBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },

  // ── Collapsed card row ── one page per exercise plus a single control, all literal
  // black-on-yellow colours since this card is the screen's one light surface.
  collapsedRow: {
    height: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingLeft: 16,
    paddingRight: 10,
  },
  chipSwipe: {
    flex: 1,
    minWidth: 0,
    height: "100%",
  },
  chipSlide: {
    height: "100%",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: 3,
  },
  chipSlideCompleted: {
    opacity: 0.55,
  },
  chipSlideRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipInfoRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  chipInfoCol: {
    gap: 4,
  },
  // Weight's own cap: unlike Set ("1/4") and Reps ("6-8"), which are always short, a load scheme
  // can be a full sentence ("moderate — find your working weight") for an exercise with no fixed
  // number to show. Confirmed live: with no width limit here, that sentence claimed however much
  // space it needed and starved the exercise-name column down to a single visible letter — the
  // opposite of the intended "Set/Reps/Weight never truncate" priority, since Weight itself was
  // never supposed to be unbounded either. Capped and left to ellipsize like the exercise name.
  chipInfoColWeight: {
    gap: 4,
    maxWidth: 92,
  },
  // Only the exercise column may shrink and ellipsize — its length is the unpredictable one,
  // and Set/Reps/Weight must never be the columns that get truncated.
  chipInfoColExercise: {
    flexShrink: 1,
    minWidth: 0,
    gap: 4,
  },
  chipInfoLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: "rgba(0,0,0,0.5)",
  },
  chipInfoLabelTag: {
    overflow: "hidden",
    alignSelf: "flex-start",
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: sessionColors.active,
    backgroundColor: "#0A0A0A",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipInfoValue: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 0.42,
    color: "#0A0A0A",
  },
  // Set/Reps/Weight share DM Sans rather than the display face: Bebas Neue's glyph metrics
  // read as sitting higher than the neighbouring values even inside a fixed-height box.
  chipInfoValueSmall: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: "#0A0A0A",
  },
  chipDivider: {
    width: 1,
    height: 14,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  chipRestRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  chipRestCounter: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 0.5,
    color: "#0A0A0A",
  },
  chipRestNextGroup: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipTag: {
    overflow: "hidden",
    alignSelf: "flex-start",
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 0.54,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chipTagUpcoming: {
    backgroundColor: "rgba(0,0,0,0.1)",
    color: "rgba(0,0,0,0.6)",
  },
  chipTagCompleted: {
    backgroundColor: "rgba(0,0,0,0.06)",
    color: "rgba(0,0,0,0.45)",
  },
  chipExercise: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 0.42,
    color: "#0A0A0A",
  },
  chipMeta: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12.5,
    color: "rgba(0,0,0,0.78)",
  },
  chipControlBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  // The dock had no padding of its own, so the input pill ran off both screen edges and sat
  // over the home indicator.
  inputDock: {
    paddingTop: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
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
  undoPill: {
    alignSelf: "center",
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  undoPillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.accent,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 68,
    paddingHorizontal: 20,
  },
  cardHeaderText: {
    flex: 1,
    gap: 1,
  },
  cardEyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: sessionColors.activeOn,
    opacity: 0.65,
  },
  cardTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.4,
    color: sessionColors.activeOn,
    textTransform: "uppercase",
  },
  gearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.1)",
  },
  timelineScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  timelineRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  timelinePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(10,10,10,0.08)",
  },
  timelinePillDone: {
    backgroundColor: "rgba(10,10,10,0.16)",
  },
  timelinePillCurrent: {
    backgroundColor: sessionColors.activeOn,
  },
  timelinePillText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: sessionColors.activeOn,
    opacity: 0.7,
  },
  timelinePillTextCurrent: {
    color: colors.accent,
    opacity: 1,
  },
  cardExpandedBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 14,
  },
  cardTargetBlock: {
    alignItems: "center",
    gap: 4,
  },
  cardTargetLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 11,
    letterSpacing: 1.6,
    color: sessionColors.activeOn,
    opacity: 0.65,
  },
  cardTargetValue: {
    fontFamily: fonts.display,
    fontSize: 44,
    letterSpacing: 1,
    color: sessionColors.activeOn,
  },
  cardTargetSub: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: sessionColors.activeOn,
    opacity: 0.65,
  },
  cardPauseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "rgba(10,10,10,0.1)",
  },
  cardPauseText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: sessionColors.activeOn,
  },
  cardStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(10,10,10,0.1)",
  },
  cardStatItem: {
    flex: 1,
    alignItems: "center",
    gap: 3,
  },
  cardStatLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1.1,
    color: sessionColors.activeOn,
    opacity: 0.65,
  },
  cardStatValue: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 0.4,
    color: sessionColors.activeOn,
  },
  cardStatDivider: {
    width: 1,
    height: 22,
    backgroundColor: "rgba(10,10,10,0.12)",
  },
  cardActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  cardActionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: sessionColors.activeOn,
  },
  cardActionBtnDisabled: {
    opacity: 0.4,
  },
  cardActionText: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 0.6,
    color: colors.accent,
  },
  cardEndBtn: {
    width: 64,
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.1)",
  },
  cardEndText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: sessionColors.activeOn,
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
