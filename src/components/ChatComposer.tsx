import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { KeyboardIcon, PlusIcon, XIcon } from "../icons";

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

export const ChatComposer = ({
  value,
  onChangeText,
  onFocus,
  focused,
  onFocusChange,
  talkActive = false,
  onAddTap,
  onExitVoiceToKeyboard,
  onCloseConversation,
}: ChatComposerProps) => {
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

  // Home's own onFocus already navigates away to GlobalChat before any text can be typed —
  // matching the reference's "simplified" composer, this is just a tap-target CTA field, with
  // none of the +/mic/send/talk row a real composer needs (see GlobalChatScreen's
  // SessionVoiceInputDock for that).
  return (
    <View style={styles.wrap}>
      <View style={[styles.bubble, focused && styles.bubbleFocused]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="Ask Mustle anything…"
          placeholderTextColor="rgba(255,255,255,0.28)"
          style={styles.field}
          multiline
          onFocus={() => {
            onFocusChange(true);
            onFocus?.();
          }}
          onBlur={() => onFocusChange(false)}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
    backgroundColor: colors.bg,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  bubbleFocused: {
    borderColor: colors.accentBorderStrong,
  },
  field: {
    fontFamily: fonts.body,
    fontSize: 14.5,
    lineHeight: 20,
    color: colors.text,
    padding: 0,
    maxHeight: 96,
    minHeight: 20,
  },
  // Not the Add-to-Chat sheet's "disabled" look, just this button's — nothing else in the
  // voice-active controls row is gated on onAddTap existing.
  dimmed: {
    opacity: 0.35,
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
});
