import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { colors, fonts } from "../constants/theme";
import { useDictation } from "../hooks/useDictation";
import {
  ArrowUpIcon,
  AudioLinesIcon,
  CheckIcon,
  KeyboardIcon,
  MicIcon,
  PlusIcon,
  XIcon,
} from "../icons";

interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onFocus?: () => void;
  focused: boolean;
  onFocusChange: (focused: boolean) => void;
  /** Hands-free voice instance — the lime button, distinct from the mic's
   *  one-shot dictation. Same session the Home orb toggles. */
  onTalkTap?: () => void;
  talkActive?: boolean;
  onAddTap?: () => void;
  /** Ends the voice call but keeps the conversation open in text mode —
   *  the keyboard button in the voice-active controls row. */
  onExitVoiceToKeyboard?: () => void;
  /** Ends the voice call AND closes the whole conversation — the X in the
   *  voice-active controls row. */
  onCloseConversation?: () => void;
}

const REC_BARS = [
  8, 16, 11, 20, 9, 17, 13, 22, 10, 15, 8, 18, 12, 21, 9, 16, 11, 19, 8, 14,
];

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function WaveBar({ height, delay }: { height: number; delay: number }) {
  const t = useSharedValue(0.4);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 450, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.4, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(t);
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: t.value }] }));

  return <Animated.View style={[styles.recWaveBar, { height }, style]} />;
}

function RecDot() {
  const t = useSharedValue(1);

  useEffect(() => {
    t.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 550, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 550, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    return () => cancelAnimation(t);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ scale: 0.8 + t.value * 0.2 }],
  }));

  return <Animated.View style={[styles.recDot, style]} />;
}

export const ChatComposer = ({
  value,
  onChangeText,
  onSend,
  onFocus,
  focused,
  onFocusChange,
  onTalkTap,
  talkActive = false,
  onAddTap,
  onExitVoiceToKeyboard,
  onCloseConversation,
}: ChatComposerProps) => {
  const dictation = useDictation((text) =>
    onChangeText(value ? `${value} ${text}` : text),
  );
  const recording = dictation.state === "recording";
  const canSend = value.trim().length > 0;

  // While a hands-free voice call is live, the design drops the text field and the
  // usual composer entirely — no bubble, just three plain controls on the background.
  if (talkActive) {
    return (
      <View style={styles.voiceControls}>
        <View style={styles.voiceControlsRow}>
          <Pressable
            style={[styles.voiceControlBtn, !onAddTap && styles.dimmed]}
            onPress={onAddTap}
            disabled={!onAddTap}
            hitSlop={6}
          >
            <PlusIcon size={18} color="#0A0A0A" />
          </Pressable>
          <Pressable
            style={styles.voiceControlBtn}
            onPress={onExitVoiceToKeyboard}
            hitSlop={6}
          >
            <KeyboardIcon size={18} color="#0A0A0A" />
          </Pressable>
          <Pressable
            style={styles.voiceControlBtnStop}
            onPress={onCloseConversation}
            hitSlop={6}
          >
            <XIcon size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { paddingBottom: focused ? 10 : 20 }]}>
      <View style={[styles.bubble, focused && styles.bubbleFocused]}>
        {recording ? (
          <View style={styles.recordingRow}>
            <Pressable
              style={styles.recCancel}
              onPress={dictation.cancel}
              hitSlop={8}
            >
              <XIcon size={14} color={colors.muted} />
            </Pressable>
            <RecDot />
            <Text style={styles.recTime}>{formatTime(dictation.seconds)}</Text>
            <View style={styles.recWave}>
              {REC_BARS.map((h, i) => (
                <WaveBar key={i} height={h} delay={i * 55} />
              ))}
            </View>
          </View>
        ) : (
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder="Talk to your coach...."
            placeholderTextColor="rgba(255,255,255,0.28)"
            style={styles.field}
            multiline
            editable={dictation.state === "idle"}
            onFocus={() => {
              onFocusChange(true);
              onFocus?.();
            }}
            onBlur={() => onFocusChange(false)}
          />
        )}

        <View style={styles.row}>
          {recording ? (
            <Text style={styles.recHint}>Listening…</Text>
          ) : (
            <Pressable
              style={[styles.plusBtn]}
              onPress={onAddTap}
              disabled={!onAddTap}
              hitSlop={6}
            >
              <PlusIcon size={18} color={colors.text} />
            </Pressable>
          )}

          <View style={styles.rowRight}>
            {!recording && canSend && (
              <Pressable style={styles.sendBtn} onPress={onSend} hitSlop={6}>
                <ArrowUpIcon size={16} color={colors.accentOn} />
              </Pressable>
            )}

            <Pressable
              style={[styles.micToggle, recording && styles.micToggleActive]}
              onPress={recording ? dictation.confirm : dictation.start}
              disabled={dictation.state === "transcribing"}
              hitSlop={6}
            >
              {recording ? (
                <CheckIcon size={16} color="#FFFFFF" />
              ) : (
                <MicIcon size={16} color={colors.text} />
              )}
            </Pressable>

            {onTalkTap && (
              <Pressable style={styles.talkBtn} onPress={onTalkTap} hitSlop={6}>
                <AudioLinesIcon size={16} color={colors.accent} />
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: colors.bg,
  },
  bubble: {
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingTop: 10,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  bubbleFocused: {
    borderColor: colors.accentBorderStrong,
  },
  field: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.text,
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 4,
    maxHeight: 96,
    minHeight: 22,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: "auto",
  },
  // Not the Add-to-Chat sheet's "disabled" look, just this button's — nothing else in the
  // composer is gated on onAddTap existing.
  dimmed: {
    opacity: 0.35,
  },
  plusBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  micToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  micToggleActive: {
    backgroundColor: "#FF4D4D",
    borderColor: "#FF4D4D",
  },
  talkBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  voiceControls: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 6,
    paddingBottom: 40,
  },
  voiceControlsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },
  voiceControlBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  voiceControlBtnStop: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },

  recordingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 2,
    paddingTop: 2,
    paddingBottom: 6,
    minHeight: 36,
  },
  recCancel: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
  },
  recDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: "#FF4D4D",
  },
  recTime: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
    minWidth: 34,
  },
  recWave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 24,
    overflow: "hidden",
  },
  recWaveBar: {
    width: 3,
    borderRadius: 2,
    marginHorizontal: 1.5,
    backgroundColor: colors.accent,
  },
  recHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
  },
});
