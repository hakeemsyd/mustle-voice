import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts } from "../constants/theme";
import { MicIcon } from "../icons/MicIcon";
import { KeyboardIcon } from "../icons/KeyboardIcon";
import {
  useVoiceRecorder,
  type StopReason,
} from "../onboarding/useVoiceRecorder";
import { transcribeRecording } from "../lib/elevenLabsVoice";

export interface VoiceInputChip {
  label: string;
}

type Mode = "mic" | "keyboard";

interface MicKeyboardVoiceInputProps {
  /** The captured answer — written by a finished recording or a chip tap. Rendered by the
   *  parent (ConversationalScreen) above this bar, under the coach question; never shown
   *  inside this component itself. */
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  /** Mic permission wasn't granted — mounts straight into keyboard mode, mic side inert. */
  micDisabled?: boolean;
  /** Fades/disables the whole control outside the "listening" phase. */
  disabled?: boolean;
  /** Normalizes the raw transcript before it's captured (e.g. spoken-number normalization) —
   *  same contract as ConversationalScreen's own formatAnswer prop. */
  formatAnswer?: (rawTranscript: string) => string;
  chips?: VoiceInputChip[];
  chipsMultiSelect?: boolean;
  onInputStateChange?: (state: { listening: boolean; typing: boolean }) => void;
  onModeChange?: (mode: Mode) => void;
  externallyValid?: boolean;
  placeholder?: string;
}

const MAX_CHIPS = 3;

// Ported from mustle-mvp's MicKeyboardVoiceInput.tsx (Name/History/Goal/Injuries' persistent
// mic+keyboard bar), with one real difference from the source: that component streams a
// *scripted* transcript word by word (no real STT exists in the prototype). This one drives an
// actual recording (useVoiceRecorder, the same VAD-based auto-stop the classic flow already
// used) and transcribes it via ElevenLabs Scribe once it stops — the transcript arrives as one
// finished string rather than word-by-word, since real STT here is one-shot on the full
// recording, not a live stream. The reveal animation at the display layer (ConversationalScreen)
// still animates it in per word for the same polish, just from data that was already fully
// known the moment it arrived instead of literally streaming in.
export const MicKeyboardVoiceInput = ({
  value,
  onChange,
  onSubmit,
  micDisabled = false,
  disabled = false,
  formatAnswer,
  chips,
  chipsMultiSelect = false,
  onInputStateChange,
  onModeChange,
  externallyValid = false,
  placeholder = "Type your answer",
}: MicKeyboardVoiceInputProps) => {
  const [mode, setMode] = useState<Mode>(micDisabled ? "keyboard" : "mic");
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [fieldFocused, setFieldFocused] = useState(false);
  const [keyboardDraft, setKeyboardDraft] = useState("");
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const { start: startRecording, stop: stopRecording } = useVoiceRecorder();
  const startedRef = useRef(false);
  const stopHandledRef = useRef(false);
  const lastSwitchAtRef = useRef(0);
  const SWITCH_DEBOUNCE_MS = 400;

  const modeProgress = useSharedValue(micDisabled ? 1 : 0);
  useEffect(() => {
    modeProgress.value = withTiming(mode === "keyboard" ? 1 : 0, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [mode]);

  // finishRecording is async (records → stops → transcribes), so by the time its result lands
  // the user may have already switched modes — read the CURRENT mode there, not whatever `mode`
  // this closure captured when the recording started.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // This screen only mounts this component while phase === "listening" (see
  // ConversationalScreen), so navigating away mid-recording (e.g. tapping back) unmounts it
  // without ever going through handleSubmit/finishRecording — release the mic instead of
  // leaving the recorder session (and allowsRecording audio mode) open.
  const listeningRef = useRef(listening);
  listeningRef.current = listening;
  useEffect(() => {
    return () => {
      if (listeningRef.current) stopRecording().catch(() => null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishRecording = async () => {
    setListening(false);
    try {
      const uri = await stopRecording();
      if (!uri) return;
      setTranscribing(true);
      const text = await transcribeRecording(uri);
      const finalText = formatAnswer ? formatAnswer(text) : text;
      if (!finalText) return;
      // The user may have switched to keyboard mode while this was still transcribing — land it
      // in the keyboard field they're now looking at, not in `value` behind their back.
      if (modeRef.current === "keyboard") {
        setKeyboardDraft((prev) =>
          [prev.trim(), finalText].filter(Boolean).join(" "),
        );
      } else {
        onChange(finalText);
      }
    } catch (err) {
      console.error("[onboarding voice] transcription failed:", err);
    } finally {
      setTranscribing(false);
    }
  };

  const beginRecording = () => {
    stopHandledRef.current = false;
    setListening(true);
    startRecording((reason: StopReason) => {
      if (stopHandledRef.current) return;
      stopHandledRef.current = true;
      if (reason === "no-speech") {
        stopRecording().catch(() => null);
        setListening(false);
        setMode("keyboard");
        return;
      }
      void finishRecording();
    }).catch((err) => {
      console.error("[onboarding voice] failed to start recording:", err);
      setListening(false);
      setMode("keyboard");
    });
  };

  // Voice-first default: auto-starts listening the moment this control becomes interactive,
  // but only if nothing's been captured yet — never overwrites an existing answer.
  useEffect(() => {
    if (disabled) {
      startedRef.current = false;
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;
    if (!micDisabled && mode === "mic" && !value.trim()) beginRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, micDisabled]);

  useEffect(() => {
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    onInputStateChange?.({
      listening,
      typing: mode === "keyboard" && (fieldFocused || micDisabled),
    });
  }, [listening, fieldFocused, micDisabled, mode, onInputStateChange]);

  const canSubmit =
    !disabled &&
    (value.trim().length > 0 ||
      keyboardDraft.trim().length > 0 ||
      externallyValid);

  const switchToKeyboard = () => {
    if (disabled || mode === "keyboard") return;
    const now = Date.now();
    if (now - lastSwitchAtRef.current < SWITCH_DEBOUNCE_MS) return;
    lastSwitchAtRef.current = now;
    if (listening) {
      stopHandledRef.current = true;
      void finishRecording();
    }
    // Pre-fill the field with whatever's already been captured so the user can review/correct
    // it, instead of leaving it empty as a second, separate channel. Confirmed live: without
    // this, speaking "Hakeem" and then typing "Hakeem" to fix a mistranscription submitted
    // "Hakeem Hakeem" — value and keyboardDraft got concatenated on submit rather than the typed
    // text replacing the spoken one, which is what switching to keyboard actually meant here.
    if (value.trim()) {
      setKeyboardDraft(value);
      onChange("");
    }
    setMode("keyboard");
  };

  const switchToMic = () => {
    if (disabled || micDisabled || mode === "mic") return;
    const now = Date.now();
    if (now - lastSwitchAtRef.current < SWITCH_DEBOUNCE_MS) return;
    lastSwitchAtRef.current = now;
    setMode("mic");
    // Symmetric with switchToKeyboard above: fold in whatever was typed rather than leaving it
    // as a second channel a fresh recording would later get silently concatenated with. Same
    // "never overwrite an existing answer" rule as below, just extended to cover a keyboard
    // draft too, not only `value`.
    if (keyboardDraft.trim()) {
      onChange([value.trim(), keyboardDraft.trim()].filter(Boolean).join(" "));
      setKeyboardDraft("");
      return;
    }
    if (!value.trim()) beginRecording();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const combined = [value.trim(), keyboardDraft.trim()]
      .filter(Boolean)
      .join(" ");
    onSubmit(combined);
    setKeyboardDraft("");
  };

  const applyChipSelection = (next: Set<string>) => {
    if (listening) {
      stopHandledRef.current = true;
      stopRecording().catch(() => null);
      setListening(false);
    }
    setSelectedChips(next);
    onChange(
      (chips ?? [])
        .filter((c) => next.has(c.label))
        .map((c) => c.label)
        .join(", "),
    );
  };

  const handleChipTap = (chip: VoiceInputChip) => {
    if (disabled) return;
    if (chipsMultiSelect) {
      const next = new Set(selectedChips);
      if (next.has(chip.label)) next.delete(chip.label);
      else next.add(chip.label);
      applyChipSelection(next);
    } else {
      const already = selectedChips.has(chip.label);
      applyChipSelection(already ? new Set() : new Set([chip.label]));
    }
  };

  const visibleChips = (chips ?? []).slice(0, MAX_CHIPS);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: modeProgress.value * 38 }],
  }));
  const keyboardRowStyle = useAnimatedStyle(() => ({
    opacity: modeProgress.value,
    transform: [{ scale: 0.97 + modeProgress.value * 0.03 }],
  }));
  const micRowStyle = useAnimatedStyle(() => ({
    opacity: 1 - modeProgress.value,
    transform: [{ scale: 1 - modeProgress.value * 0.03 }],
  }));
  const sendVisible = canSubmit;
  const sendStyle = useAnimatedStyle(() => ({
    opacity: withTiming(sendVisible ? 1 : 0, { duration: 180 }),
    transform: [
      { scale: withTiming(sendVisible ? 1 : 0.6, { duration: 180 }) },
    ],
  }));

  const Toggle = ({ inline }: { inline: boolean }) => (
    <View style={[styles.toggle, inline && styles.toggleInline]}>
      <Animated.View
        style={[
          styles.toggleThumb,
          inline && styles.toggleThumbInline,
          thumbStyle,
        ]}
      />
      <Pressable
        style={[styles.toggleBtn, inline && styles.toggleBtnInline]}
        onPress={switchToMic}
        disabled={disabled || micDisabled}
      >
        <MicIcon
          size={inline ? 14 : 15}
          color={mode === "mic" ? colors.bg : "rgba(255,255,255,0.55)"}
        />
      </Pressable>
      <Pressable
        style={[styles.toggleBtn, inline && styles.toggleBtnInline]}
        onPress={switchToKeyboard}
        disabled={disabled}
      >
        <KeyboardIcon
          size={inline ? 14 : 15}
          color={mode === "keyboard" ? colors.bg : "rgba(255,255,255,0.55)"}
        />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
      {visibleChips.length > 0 && (
        <View style={styles.chipsRow}>
          {visibleChips.map((chip) => {
            const selected = selectedChips.has(chip.label);
            return (
              <Pressable
                key={chip.label}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => handleChipTap(chip)}
                disabled={disabled}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextSelected]}
                >
                  {chip.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.rowStack}>
        <Animated.View
          // Both rows are absolutely positioned on top of each other and crossfade over 240ms —
          // without an explicit z-index, RN paints them in JSX order regardless of which one is
          // actually live, so for most of that crossfade the fading-OUT row still sits visually
          // (and interactively, since a low-opacity view is still hit-testable) on top of the one
          // that just became active. Confirmed: this is what read as "the toggle needs multiple
          // taps" — the first tap landed on the still-topmost outgoing row, and the mic row's own
          // screen position (centered) differs from the keyboard row's (toggle glued left), so a
          // frustrated second tap in the same spot often didn't land on anything useful either.
          style={[styles.keyboardRow, keyboardRowStyle, { zIndex: mode === "keyboard" ? 1 : 0 }]}
          pointerEvents={mode === "keyboard" ? "auto" : "none"}
        >
          <View style={styles.inputBar}>
            <Toggle inline />
            <TextInput
              style={styles.input}
              placeholder={value.trim() ? "Add anything else…" : placeholder}
              placeholderTextColor="rgba(255,255,255,0.32)"
              value={keyboardDraft}
              editable={!disabled}
              onChangeText={(t) => {
                setKeyboardDraft(t);
                if (selectedChips.size > 0) setSelectedChips(new Set());
              }}
              onFocus={() => setFieldFocused(true)}
              onBlur={() => setFieldFocused(false)}
              onSubmitEditing={handleSubmit}
            />
            <Animated.View style={sendStyle}>
              <Pressable
                style={styles.sendBtnInline}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                <MaterialIcons
                  name="arrow-forward"
                  size={16}
                  color={colors.bg}
                />
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>

        <Animated.View
          style={[styles.toggleRow, micRowStyle, { zIndex: mode === "mic" ? 1 : 0 }]}
          pointerEvents={mode === "mic" ? "auto" : "none"}
        >
          <View style={styles.toggleRowSpacer} />
          <Toggle inline={false} />
          <View style={styles.rowActions}>
            <Animated.View style={sendStyle}>
              <Pressable
                style={styles.sendBtn}
                onPress={handleSubmit}
                disabled={!canSubmit}
              >
                <MaterialIcons
                  name="arrow-forward"
                  size={17}
                  color={colors.bg}
                />
              </Pressable>
            </Animated.View>
          </View>
        </Animated.View>
      </View>

      {transcribing && (
        <Text style={styles.transcribingLabel}>Transcribing…</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
    width: "100%",
  },
  wrapDisabled: {
    opacity: 0,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 7,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  chipSelected: {
    borderColor: "rgba(200,241,53,0.45)",
    backgroundColor: "rgba(200,241,53,0.10)",
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  chipTextSelected: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
  },
  rowStack: {
    height: 46,
  },
  keyboardRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 46,
  },
  toggleRow: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toggleRowSpacer: {
    flex: 1,
  },
  rowActions: {
    flex: 1,
    alignItems: "flex-end",
  },
  inputBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(200, 241, 53, 0.4)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingRight: 4,
  },
  input: {
    flex: 1,
    height: "100%",
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 2,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    padding: 4,
  },
  toggleInline: {
    padding: 3,
  },
  toggleThumb: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  toggleThumbInline: {
    top: 3,
    left: 3,
    width: 36,
    height: 36,
  },
  toggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnInline: {
    width: 36,
    height: 36,
  },
  sendBtnInline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  transcribingLabel: {
    position: "absolute",
    bottom: -20,
    alignSelf: "center",
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.muted,
  },
});
