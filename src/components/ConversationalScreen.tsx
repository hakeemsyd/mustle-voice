import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Orb, type OrbState } from "../onboarding/Orb";
import { ProgressDots } from "../onboarding/ProgressDots";
import {
  useVoiceRecorder,
  type StopReason,
} from "../onboarding/useVoiceRecorder";
import { useSpeakOnMount } from "../onboarding/useSpeakOnMount";
import { useKeyboardOpen } from "../hooks/useKeyboardOpen";

import { BackIcon } from "../icons/BackIcon";

import { colors, fonts } from "../constants/theme";
import { useWordTyping } from "../hooks/useWordTyping";
import { transcribeRecording } from "../lib/elevenLabsVoice";

import { VoiceButton } from "./VoiceButton";
import { TypeInsteadButton } from "./TypeInsteadButton";
import { ConversationAnswerCard } from "./ConversationAnswerCard";
import { ConversationContinueButton } from "./ConversationContinueButton";
import { UseVoiceInsteadButton } from "./UseVoiceInsteadButton";
import { MicKeyboardVoiceInput } from "./MicKeyboardVoiceInput";

// Matches the source design's `instantReveal` (now the only mode every conversational
// onboarding screen uses — see mustle-mvp's ConversationalScreen.tsx header comment): the coach
// message renders at its one, final size from the very first word, so there's no separate
// pause/shrink phase or size animation to run — "speaking" goes straight to "listening" once
// typing finishes.
type Phase =
  | "speaking" // coach message revealing word by word, TTS audio playing
  | "listening" // YOU SPEAK zone visible, mic recording
  | "transcribing" // recording stopped, awaiting STT result
  | "filling" // real transcript typing in
  | "processing"; // orb processing, then advance

const WORD_SPEED_COACH = 90;
const WORD_SPEED_FILL = 110;

interface ConversationalScreenProps {
  coachMessage: string;
  typeInputPlaceholder?: string;
  typeInputUnit?: string;
  typeSlot?: React.ReactNode;
  typeValid?: boolean;
  forceTypeMode?: boolean;
  dotIndex: number;
  showBack?: boolean;
  onBack?: () => void;
  onComplete: (value: string) => void;
  /** Transforms the raw STT transcript before it's shown and passed to onComplete (e.g. normalizing spoken numbers). */
  formatAnswer?: (rawTranscript: string) => string;
  /** Tappable shortcuts shown above the type-mode input — tapping toggles the label into
   *  typeValue's comma-joined list rather than auto-submitting, so free typing still composes
   *  with whatever chips are selected. */
  chips?: { label: string }[];
  /** unifiedInput only — allows multiple chips selected at once (Goal); History/Name are
   *  single-select. Classic mode's own chip toggle (type-mode branch) is already effectively
   *  multi-select regardless of this flag. */
  chipsMultiSelect?: boolean;
  /** Replaces the classic "YOU SPEAK zone + Type instead" flow with one persistent mic/keyboard
   *  bar (MicKeyboardVoiceInput) — see mustle-mvp's ConversationalScreen.tsx for the source this
   *  ports. Currently used by Name/History/Goal/Injuries. */
  unifiedInput?: boolean;
  /** Orb diameter in px — unifiedInput screens use 126 (10% smaller); classic screens keep the
   *  default 140. */
  orbSize?: number;
  /** unifiedInput only — rendered right under the coach message, above the transcript/mic bar.
   *  For a short-lived trigger that belongs with the question rather than the answer (e.g.
   *  Injuries' "Mark on body map" button opening a sheet). */
  belowMessageSlot?: React.ReactNode;
}

function toggleChipInValue(current: string, label: string): string {
  const parts = current
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const index = parts.findIndex((p) => p.toLowerCase() === label.toLowerCase());
  if (index >= 0) parts.splice(index, 1);
  else parts.push(label);
  return parts.join(", ");
}

export const ConversationalScreen = ({
  coachMessage,
  typeInputPlaceholder = "Type here...",
  typeInputUnit,
  typeSlot,
  typeValid,
  forceTypeMode = false,
  dotIndex,
  showBack = true,
  onBack,
  onComplete,
  formatAnswer,
  chips,
  chipsMultiSelect = false,
  unifiedInput = false,
  orbSize = 140,
  belowMessageSlot,
}: ConversationalScreenProps) => {
  const [phase, setPhase] = useState<Phase>(
    forceTypeMode && !unifiedInput ? "listening" : "speaking",
  );
  const [typeMode, setTypeMode] = useState(forceTypeMode && !unifiedInput);
  const [typeValue, setTypeValue] = useState("");
  const [transcript, setTranscript] = useState("");
  const [capturedValue, setCapturedValue] = useState("");
  const [unifiedListening, setUnifiedListening] = useState(false);
  const [unifiedMode, setUnifiedMode] = useState<"mic" | "keyboard">("mic");
  const keyboardOpen = useKeyboardOpen();
  // Confirmed live: tap a chip, toggle to text, and the keyboard pushes the question + captured
  // answer down until they crowd the chips/input right above the keyboard — worst on a shorter
  // phone screen. The orb was never load-bearing once typing starts, so it's the one thing safe
  // to drop for the room; it comes back the moment the keyboard closes.
  const orbHiddenForKeyboard = unifiedInput && unifiedMode === "keyboard" && keyboardOpen;

  const { audioDone, audioStarted } = useSpeakOnMount(
    coachMessage,
    !forceTypeMode,
  );
  const { start: startRecording, stop: stopRecording } = useVoiceRecorder();
  const voiceTapHandledRef = useRef(false);

  const youSpeakFade = useSharedValue(1);

  const youSpeakFadeStyle = useAnimatedStyle(() => ({
    opacity: youSpeakFade.value,
  }));

  const { count: coachCount, words: coachWords } = useWordTyping(
    coachMessage,
    phase === "speaking" && audioStarted,
    WORD_SPEED_COACH,
  );

  const {
    count: fillCount,
    isDone: fillDone,
    words: fillWords,
  } = useWordTyping(transcript, phase === "filling", WORD_SPEED_FILL);

  // speaking → listening directly (instantReveal — no intermediate pause/shrink hold; only a
  // short buffer once both the word reveal and the TTS audio have finished).
  useEffect(() => {
    if (phase === "speaking" && coachCount >= coachWords.length && audioDone) {
      const timer = setTimeout(() => setPhase("listening"), 100);
      return () => clearTimeout(timer);
    }
  }, [phase, coachCount, coachWords.length, audioDone]);

  // listening → start recording the user's answer; auto-stops once they pause after speaking.
  // unifiedInput owns its own recording (MicKeyboardVoiceInput), so this classic-flow effect
  // must not also try to record.
  useEffect(() => {
    if (unifiedInput) return;
    if (phase === "listening" && !typeMode) {
      voiceTapHandledRef.current = false;
      startRecording((reason) => {
        handleVoiceTap(reason);
      }).catch((err) => {
        console.error("[onboarding voice] failed to start recording:", err);
        setTypeMode(true);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, typeMode]);

  // filling → processing
  useEffect(() => {
    if (phase === "filling" && fillDone) {
      const timer = setTimeout(() => setPhase("processing"), 400);
      return () => clearTimeout(timer);
    }
  }, [phase, fillDone]);

  // processing → complete
  useEffect(() => {
    if (phase === "processing") {
      youSpeakFade.value = withTiming(0.35, { duration: 400 });

      const timer = setTimeout(() => {
        onComplete(
          unifiedInput
            ? capturedValue.trim()
            : typeMode
              ? typeValue.trim()
              : transcript,
        );
      }, 1800);
      return () => clearTimeout(timer);
    } else {
      youSpeakFade.value = withTiming(1, { duration: 200 });
    }
  }, [phase]);

  const orbState: OrbState = (() => {
    switch (phase) {
      case "speaking":
        return "speaking";
      case "listening":
        // unifiedInput mirrors what MicKeyboardVoiceInput is actually doing (mic actively
        // streaming vs. typing/idle) instead of a blanket "listening" — same binary the source
        // uses, deliberately no third "breathing" fallback (see mustle-mvp's orbState comment).
        return unifiedInput
          ? unifiedListening
            ? "listening"
            : "typing"
          : "listening";
      case "transcribing":
      case "filling":
        return "listening";
      case "processing":
        return "processing";
    }
  })();

  const youSpeakVisible =
    phase === "listening" ||
    phase === "transcribing" ||
    phase === "filling" ||
    phase === "processing";

  const handleVoiceTap = async (reason?: StopReason) => {
    if (phase !== "listening" || voiceTapHandledRef.current) return;
    voiceTapHandledRef.current = true;

    if (reason === "no-speech") {
      console.warn("[onboarding voice] nothing heard — switching to type mode");
      await stopRecording().catch(() => null);
      setTypeMode(true);
      return;
    }

    setPhase("transcribing");

    try {
      const uri = await stopRecording();
      if (!uri) throw new Error("No recording captured");

      const text = await transcribeRecording(uri);
      if (!text) throw new Error("Empty transcript");

      setTranscript(formatAnswer ? formatAnswer(text) : text);
      setPhase("filling");
    } catch (err) {
      console.error("[onboarding voice] transcription failed:", err);
      setPhase("listening");
      setTypeMode(true);
    }
  };

  const typeCanSubmit =
    typeValid !== undefined ? typeValid : !!typeValue.trim();

  const handleTypeSubmit = () => {
    if (!typeCanSubmit) return;
    setPhase("processing");
  };

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.topBar}>
        {showBack ? (
          <TouchableOpacity
            style={styles.topBarSpacer}
            activeOpacity={0.7}
            onPress={onBack}
          >
            <BackIcon />
          </TouchableOpacity>
        ) : (
          <View style={styles.topBarSpacer} />
        )}

        <ProgressDots total={11} current={dotIndex} />

        {/* Matches the left side's width so the centered step count is actually centered on the
            screen, not just within the leftover space next to the back button. */}
        <View style={styles.topBarSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.content}>
          {unifiedInput ? (
            <Animated.View
              style={styles.flex}
              layout={LinearTransition.springify()}
              entering={FadeIn.duration(250)}
            >
              {!orbHiddenForKeyboard && (
                <View style={styles.orbContainer}>
                  <Orb state={orbState} size={orbSize} />
                </View>
              )}

              <Text style={[styles.message, orbHiddenForKeyboard && styles.messageKeyboardOpen]}>
                {coachWords.map((w, i) => (
                  <RevealWord
                    key={i}
                    text={w}
                    isLast={i === coachWords.length - 1}
                    revealed={phase !== "speaking" || i < coachCount}
                    style={styles.message}
                  />
                ))}
              </Text>

              {belowMessageSlot && (
                <View style={styles.belowMessageSlotWrap}>
                  {belowMessageSlot}
                </View>
              )}

              {phase !== "speaking" && capturedValue.trim().length > 0 ? (
                <Animated.Text
                  key={capturedValue}
                  entering={FadeIn.duration(300)}
                  style={styles.unifiedTranscript}
                >
                  {capturedValue}
                </Animated.Text>
              ) : phase === "listening" && unifiedMode === "mic" ? (
                <View style={styles.listenDotsWrap}>
                  <ListenDots />
                </View>
              ) : null}

              <View style={styles.flexSpacer} />

              {phase === "listening" && (
                <Animated.View
                  entering={FadeInUp.duration(300)}
                  style={styles.bottomContainer}
                >
                  <MicKeyboardVoiceInput
                    value={capturedValue}
                    onChange={setCapturedValue}
                    onSubmit={(finalValue) => {
                      setCapturedValue(finalValue);
                      setPhase("processing");
                    }}
                    micDisabled={forceTypeMode}
                    formatAnswer={formatAnswer}
                    chips={chips}
                    chipsMultiSelect={chipsMultiSelect}
                    placeholder={typeInputPlaceholder}
                    onInputStateChange={(s) => setUnifiedListening(s.listening)}
                    onModeChange={setUnifiedMode}
                  />
                </Animated.View>
              )}
            </Animated.View>
          ) : !typeMode ? (
            <Animated.View
              style={styles.flex}
              layout={LinearTransition.springify()}
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(250)}
            >
              <View style={styles.orbContainer}>
                <Orb state={orbState} size={140} />
              </View>

              <Text style={styles.message}>
                {coachWords.map((w, i) => (
                  <RevealWord
                    key={i}
                    text={w}
                    isLast={i === coachWords.length - 1}
                    revealed={phase !== "speaking" || i < coachCount}
                    style={styles.message}
                  />
                ))}
              </Text>

              <View style={styles.flexSpacer} />

              {youSpeakVisible && (
                <Animated.View
                  entering={FadeInUp.duration(300)}
                  style={styles.bottomContainer}
                >
                  {phase === "listening" ? (
                    <VoiceButton onPress={() => handleVoiceTap()} />
                  ) : phase === "transcribing" ? (
                    <Animated.View
                      entering={FadeIn.duration(250)}
                      style={[styles.responseCard, youSpeakFadeStyle]}
                    >
                      <Text style={styles.responseText}>Got it — one sec…</Text>
                    </Animated.View>
                  ) : (
                    <Animated.View
                      layout={LinearTransition.springify()}
                      entering={FadeIn.duration(250)}
                      style={[styles.responseCard, youSpeakFadeStyle]}
                    >
                      <Text style={styles.responseText}>
                        {fillWords.map((w, i) => (
                          <RevealFillWord
                            key={i}
                            text={w}
                            isLast={i === fillWords.length - 1}
                            revealed={phase === "processing" || i < fillCount}
                            style={styles.responseText}
                          />
                        ))}
                      </Text>
                    </Animated.View>
                  )}

                  <TypeInsteadButton
                    disabled={phase !== "listening"}
                    onPress={() => {
                      stopRecording().catch(() => {});
                      setTypeMode(true);
                    }}
                  />
                </Animated.View>
              )}
            </Animated.View>
          ) : (
            <Animated.View
              style={styles.flex}
              layout={LinearTransition.springify()}
              entering={FadeIn.duration(250)}
              exiting={FadeOut.duration(250)}
            >
              <View style={styles.typingOrbContainer}>
                <Orb state="typing" size={100} />
              </View>

              <Animated.Text
                entering={FadeInUp.duration(250)}
                style={styles.typingMessage}
              >
                {coachMessage}
              </Animated.Text>

              {chips && chips.length > 0 && (
                <View style={styles.chipRow}>
                  {chips.map((chip) => {
                    const selected = typeValue
                      .split(",")
                      .map((p) => p.trim().toLowerCase())
                      .includes(chip.label.toLowerCase());
                    return (
                      <TouchableOpacity
                        key={chip.label}
                        activeOpacity={0.8}
                        style={[styles.chip, selected && styles.chipSelected]}
                        onPress={() =>
                          setTypeValue((prev) =>
                            toggleChipInValue(prev, chip.label),
                          )
                        }
                      >
                        <Text
                          style={[
                            styles.chipText,
                            selected && styles.chipTextSelected,
                          ]}
                        >
                          {chip.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {typeSlot ?? (
                <ConversationAnswerCard
                  value={typeValue}
                  placeholder={typeInputPlaceholder}
                  unit={typeInputUnit}
                  onChangeText={setTypeValue}
                />
              )}

              <View style={styles.flexSpacer} />

              <Animated.View
                entering={FadeInUp.duration(300)}
                style={styles.bottomContainer}
              >
                <ConversationContinueButton
                  disabled={!typeCanSubmit}
                  onPress={handleTypeSubmit}
                />

                {!forceTypeMode && (
                  <UseVoiceInsteadButton
                    onPress={() => {
                      setTypeMode(false);
                      setTypeValue("");
                    }}
                  />
                )}
              </Animated.View>
            </Animated.View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const WORD_EASE = Easing.bezier(0.2, 0, 0.2, 1);
const FILL_WORD_EASE = Easing.bezier(0.25, 0, 0.4, 1);

// Coach-message words fade in AND rise slightly (matches the source's `wordAppear` keyframe:
// opacity 0→1, translateY 6px→0, 220ms).
function RevealWord({
  text,
  revealed,
  isLast,
  style,
}: {
  text: string;
  revealed: boolean;
  isLast: boolean;
  style: any;
}) {
  const progress = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    if (revealed)
      progress.value = withTiming(1, { duration: 220, easing: WORD_EASE });
  }, [revealed]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 6 }],
  }));
  return (
    <Animated.Text style={[style, animStyle]}>
      {text}
      {isLast ? "" : " "}
    </Animated.Text>
  );
}

// Fill (transcript) words only fade — no rise (matches the source's `fillWordAppear`
// keyframe: opacity 0→1 only, 380ms).
function RevealFillWord({
  text,
  revealed,
  isLast,
  style,
}: {
  text: string;
  revealed: boolean;
  isLast: boolean;
  style: any;
}) {
  const progress = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    if (revealed)
      progress.value = withTiming(1, { duration: 380, easing: FILL_WORD_EASE });
  }, [revealed]);
  const animStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  return (
    <Animated.Text style={[style, animStyle]}>
      {text}
      {isLast ? "" : " "}
    </Animated.Text>
  );
}

// Three dots pulsing in sequence (matches the source's `dotPulse` keyframe: opacity 0.2→1→0.2,
// scale 0.7→1.3→0.7, 800ms, staggered 180ms apart) — shown under the coach question while
// actively listening with nothing captured yet. This was missing entirely before: that spot
// showed nothing at all until the first word of an answer landed.
function ListenDot({ delayMs }: { delayMs: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + progress.value * 0.8,
    transform: [{ scale: 0.7 + progress.value * 0.6 }],
  }));
  return <Animated.View style={[styles.listenDot, style]} />;
}

function ListenDots() {
  return (
    <View style={styles.listenDotsRow}>
      <ListenDot delayMs={0} />
      <ListenDot delayMs={180} />
      <ListenDot delayMs={360} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  flex: {
    flex: 1,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    // A little beyond the raw safe-area edge SafeAreaView already insets for — sitting flush
    // against that boundary read as crowding the notch/Dynamic Island on a real device.
    paddingTop: 8,
  },

  topBarSpacer: {
    width: 32,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
  },

  orbContainer: {
    alignItems: "center",
    paddingTop: 12,
  },

  // Applied to the coach message only while the keyboard is open in text mode (see
  // orbHiddenForKeyboard) — with the orb gone, the question sits right at the top of `content`
  // instead of below it, giving the chips/input the extra room they need above the keyboard.
  messageKeyboardOpen: {
    marginTop: 8,
  },

  // Matches the source's instantReveal final ("shrank") state — every consumer of this
  // component uses it now, so the message renders at this one size/weight/opacity from its
  // first word rather than animating down from a larger one (see Phase type's comment above).
  message: {
    textAlign: "center",
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
    opacity: 0.65,
    color: colors.text,
    maxWidth: 300,
    alignSelf: "center",
  },

  typingOrbContainer: {
    alignItems: "center",
    marginTop: 24,
  },

  typingMessage: {
    marginTop: 20,
    marginBottom: 24,
    color: "rgba(255,255,255,0.55)",
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
  },

  flexSpacer: {
    flex: 1,
  },

  // Matches the source's shared .youSpeakArea padding (0 24px 44px) — used for both the classic
  // YOU SPEAK zone and the unifiedInput mic/keyboard bar.
  bottomContainer: {
    paddingBottom: 44,
    gap: 16,
  },

  responseCard: {
    minHeight: 58,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.2)",
    backgroundColor: "rgba(200,241,53,0.06)",
    paddingHorizontal: 22,
    paddingVertical: 14,
    justifyContent: "center",
  },

  responseText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    // Source's .responseText is line-height:1.65 (relative), not a fixed px value — 17*1.65≈28.
    lineHeight: 28,
    color: colors.text,
    textAlign: "center",
  },

  belowMessageSlotWrap: {
    alignItems: "center",
    marginTop: 26,
    // Source adds extra bottom margin here specifically (Vlad, 25 Aug: more room between
    // "Mark on body map" and the answer text below it) — the spacer after unifiedTranscript
    // only floors at 24px, which read as too tight once the answer text is multi-line.
    marginBottom: 20,
  },

  unifiedTranscript: {
    marginTop: 16,
    fontFamily: fonts.bodySemiBold,
    fontSize: 17,
    lineHeight: 28,
    color: colors.text,
    textAlign: "center",
  },

  listenDotsWrap: {
    marginTop: 16,
    alignItems: "center",
  },
  listenDotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  listenDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "rgba(200,241,53,0.6)",
  },

  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },

  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },

  chipSelected: {
    borderColor: "rgba(200,241,53,0.4)",
    backgroundColor: "rgba(200,241,53,0.1)",
  },

  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: "rgba(255,255,255,0.65)",
  },

  chipTextSelected: {
    color: colors.accent,
  },
});
