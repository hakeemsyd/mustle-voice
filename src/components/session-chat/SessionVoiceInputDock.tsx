import React, { forwardRef, useEffect } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts } from "../../constants/theme";
import { MMark } from "../../icons/MMark";
import { MicIcon } from "../../icons/MicIcon";
import { MicOffIcon } from "../../icons/MicOffIcon";
import { KeyboardIcon } from "../../icons/KeyboardIcon";
import { PlusIcon } from "../../icons/PlusIcon";
import { ArrowRightIcon } from "../../icons/ArrowRightIcon";

type DockMode = "mic" | "keyboard";

interface SessionVoiceInputDockProps {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  mode: DockMode;
  onModeChange: (m: DockMode) => void;
  isVoiceActive: boolean;
  onToggleVoice: () => void;
  orbState?: string;
  /** Raw connection status + reconnect flag, so the banner can say "connecting"/"reconnecting"
   *  rather than mapping both onto the orb's generic "processing" state. */
  voiceStatus?: string;
  reconnecting?: boolean;
  parsePreview?: string | null;
  placeholder?: string;
  /** Renders the "+" attach button to the left of the toggle. Omit to keep the bar centered
   *  with no attach affordance. */
  onAttachTap?: () => void;
  /** When provided, mic mode's right-hand slot is a persistent mute toggle instead of the
   *  conditional send button. */
  muted?: boolean;
  onToggleMute?: () => void;
}

const ORB_HINTS: Record<string, string> = {
  listening: "LISTENING…",
  processing: "THINKING…",
  speaking: "SPEAKING",
};

const BAR_MIN = 3.5;
const BAR_MAX = 11;

function SpeakBar({ delay }: { delay: number }) {
  const height = useSharedValue(BAR_MIN);

  useEffect(() => {
    height.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(BAR_MAX, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(BAR_MIN, { duration: 350, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  // Animating height rather than scaleY: RN has no transform-origin, so a scaled bar would grow
  // from its centre in both directions instead of rising off the baseline.
  const style = useAnimatedStyle(() => ({ height: height.value }));

  return <Animated.View style={[styles.speakBar, style]} />;
}

// The reference pulses this ring whenever the mic isn't muted. Gated on a conversation actually
// being connected here: a static accent ring is styling, but a pulsing one reads as "recording
// right now", and animating it against a closed mic would be saying something untrue.
function MicPulseRing() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 0.45 + progress.value * 0.55,
    transform: [{ scale: 1 + progress.value * 0.09 }],
  }));

  return <Animated.View style={[styles.mutePulse, style]} pointerEvents="none" />;
}

export const SessionVoiceInputDock = forwardRef<TextInput, SessionVoiceInputDockProps>(
  (
    {
      value,
      onChangeText,
      onSend,
      mode,
      onModeChange,
      isVoiceActive,
      onToggleVoice,
      orbState,
      voiceStatus,
      reconnecting = false,
      parsePreview,
      placeholder = "Add anything else…",
      onAttachTap,
      muted = false,
      onToggleMute,
    },
    ref,
  ) => {
    const handleMicPress = () => {
      if (mode !== "mic") {
        onModeChange("mic");
        // Confirmed live: after the call ends on its own (silence timeout) while keyboard mode
        // is showing, this used to only switch the UI back to mic mode — reconnecting needed a
        // second tap on what was now a different button, which read as the control doing nothing.
        // Only auto-reconnect when there isn't already a live call to leave alone (e.g. the user
        // switched to keyboard mid-call on purpose and just wants the mic view back, not a toggle).
        if (!isVoiceActive) onToggleVoice();
        return;
      }
      onToggleVoice();
    };

    const handleKeyboardPress = () => {
      if (isVoiceActive) onToggleVoice();
      onModeChange("keyboard");
    };

    const canSubmit = value.trim().length > 0;
    // Shown for the whole of mic mode so the dock is never empty, but the animated bars only run
    // while a call is genuinely connected — those bars read as "I'm listening right now", and
    // showing them with no call live at all was a real false affordance: confirmed live, a user
    // started talking to a disconnected mic because "YOU SPEAK" with pulsing bars looked identical
    // whether or not the agent could actually hear them. Idle/disconnected gets a plain, static
    // prompt instead, visually distinct from the live states below it.
    const showSpeakBanner = mode === "mic" && !muted;
    const isLive = isVoiceActive && voiceStatus === "connected";
    const speakLabel = reconnecting
      ? "RECONNECTING…"
      : voiceStatus === "connecting"
        ? "CONNECTING…"
        : isLive
          ? (orbState && ORB_HINTS[orbState]) || "YOU SPEAK"
          : "TAP TO TALK";

    return (
      <View style={styles.wrap}>
        {showSpeakBanner && (
          <View style={styles.speakBanner}>
            {(isLive || reconnecting || voiceStatus === "connecting") && (
              <View style={styles.speakBars}>
                <SpeakBar delay={0} />
                <SpeakBar delay={140} />
                <SpeakBar delay={280} />
              </View>
            )}
            <Text style={styles.speakText}>{speakLabel}</Text>
          </View>
        )}

        {parsePreview && !showSpeakBanner && <Text style={styles.parsePreview}>{parsePreview}</Text>}

        <View style={styles.row}>
          {mode === "keyboard" ? (
            <>
              {onAttachTap && (
                <Pressable style={styles.attachBtn} onPress={onAttachTap} hitSlop={6}>
                  <PlusIcon size={19} color="rgba(255,255,255,0.65)" />
                </Pressable>
              )}
              <View style={styles.inputBar}>
                <View style={[styles.toggle, styles.toggleInline]}>
                  <View style={[styles.toggleThumb, styles.toggleThumbInline, styles.toggleThumbInlineRight]} />
                  <Pressable style={styles.toggleBtnInline} onPress={handleMicPress} hitSlop={4}>
                    <MMark size={14} color="rgba(255,255,255,0.55)" />
                  </Pressable>
                  <Pressable style={styles.toggleBtnInline} onPress={handleKeyboardPress} hitSlop={4}>
                    <KeyboardIcon size={14} color={colors.accentOn} />
                  </Pressable>
                </View>
                <TextInput
                  ref={ref}
                  style={styles.input}
                  value={value}
                  onChangeText={onChangeText}
                  onSubmitEditing={onSend}
                  placeholder={placeholder}
                  placeholderTextColor="rgba(255,255,255,0.32)"
                  returnKeyType="send"
                  selectionColor={colors.accent}
                />
                {canSubmit && (
                  <Pressable style={styles.sendBtnInline} onPress={onSend} hitSlop={6}>
                    <ArrowRightIcon size={16} color={colors.accentOn} />
                  </Pressable>
                )}
              </View>
            </>
          ) : (
            <>
              {/* The toggle is centred against the dock's full width, with the side buttons
                  taken out of flow and pinned to each edge. The reference balances them with a
                  negative-margin spacer instead, but Yoga doesn't subtract a negative margin
                  from a row's free space the way the browser does, so that arithmetic left the
                  toggle visibly off-centre. */}
              <View style={styles.micCenter}>
                <View style={styles.toggle}>
                  <View style={styles.toggleThumb} />
                  <Pressable style={styles.toggleBtn} onPress={handleMicPress} hitSlop={4}>
                    <MMark size={15} color={colors.accentOn} />
                  </Pressable>
                  <Pressable style={styles.toggleBtn} onPress={handleKeyboardPress} hitSlop={4}>
                    <KeyboardIcon size={15} color="rgba(255,255,255,0.55)" />
                  </Pressable>
                </View>
              </View>

              {onAttachTap && (
                <Pressable style={[styles.attachBtn, styles.slotLeft]} onPress={onAttachTap} hitSlop={6}>
                  <PlusIcon size={19} color="rgba(255,255,255,0.65)" />
                </Pressable>
              )}

              <View style={styles.slotRight}>
                {onToggleMute ? (
                  <Pressable
                    style={[styles.muteBtn, !muted && styles.muteBtnLive]}
                    // Mute only means anything once a conversation exists, so before one does
                    // this opens it instead of sitting there inert.
                    onPress={isVoiceActive ? onToggleMute : onToggleVoice}
                    hitSlop={6}
                  >
                    {isVoiceActive && !muted && <MicPulseRing />}
                    {muted ? (
                      <MicOffIcon size={16} color="rgba(255,255,255,0.4)" />
                    ) : (
                      <MicIcon size={16} color={colors.accent} />
                    )}
                  </Pressable>
                ) : canSubmit ? (
                  <Pressable style={styles.sendBtn} onPress={onSend} hitSlop={6}>
                    <ArrowRightIcon size={17} color={colors.accentOn} />
                  </Pressable>
                ) : null}
              </View>
            </>
          )}
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  speakBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 10,
  },
  speakBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2.5,
    height: BAR_MAX,
  },
  speakBar: {
    width: 2.5,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  speakText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.muted,
  },
  parsePreview: {
    fontFamily: fonts.body,
    fontSize: 11,
    textAlign: "center",
    color: colors.muted,
    paddingBottom: 8,
  },
  row: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
    height: 46,
  },
  // Mic mode's only in-flow child, so it spans the row and centres the toggle on the dock.
  micCenter: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  slotLeft: {
    position: "absolute",
    left: 0,
  },
  slotRight: {
    position: "absolute",
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
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
  toggleThumb: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: colors.accent,
  },
  toggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  toggleInline: {
    padding: 3,
  },
  toggleThumbInline: {
    top: 3,
    left: 3,
    width: 36,
    height: 36,
  },
  toggleThumbInlineRight: {
    transform: [{ translateX: 38 }],
  },
  toggleBtnInline: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },

  inputBar: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingRight: 4,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: colors.text,
    paddingHorizontal: 2,
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
  muteBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  muteBtnLive: {
    borderColor: colors.accentBorderStrong,
  },
  mutePulse: {
    position: "absolute",
    left: -3,
    right: -3,
    top: -3,
    bottom: -3,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: colors.accentDim,
  },
});
