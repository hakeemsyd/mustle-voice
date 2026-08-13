import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { ArrowUpIcon } from "../icons";

interface SessionInputBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Live read-out of how the current text parses as a set — shown only when
   *  it looks like a set report, so a misparse is visible before committing. */
  parsePreview?: string | null;
}

// Text-only chat bar (neutral) — the session-acting controls live in
// SessionControlBar below it, matching the design's "one bar to talk, one bar
// to act" split. Mic dictates into this same field rather than being a
// separate voice path.
export const SessionInputBar = ({ value, onChangeText, onSend, parsePreview }: SessionInputBarProps) => {
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0;

  return (
    <View style={styles.wrap}>
      {parsePreview ? <Text style={styles.preview}>{parsePreview}</Text> : null}

      <View style={styles.bar}>
        <View style={[styles.fieldWrap, focused && styles.fieldWrapFocused]}>
          <TextInput
            value={value}
            // A whitespace-only draft would hide the placeholder while `canSend` (which
            // trims) keeps the send button hidden — the field reads as broken. Collapse it
            // back to empty so that state can't happen.
            onChangeText={(text) => onChangeText(text.trim().length === 0 ? "" : text)}
            placeholder="Report your set, or ask your coach…"
            placeholderTextColor={colors.muted}
            style={styles.field}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmitEditing={onSend}
            multiline
          />
        </View>

        {canSend && (
          <Pressable style={[styles.actionBtn, styles.actionBtnAccent]} onPress={onSend} hitSlop={6}>
            <ArrowUpIcon size={18} color={colors.accentOn} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  preview: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.accent,
    textAlign: "center",
    paddingBottom: 6,
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingVertical: 10,
  },
  fieldWrap: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  fieldWrapFocused: {
    borderColor: colors.accentBorder,
  },
  field: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    maxHeight: 84,
    padding: 0,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionBtnRecording: {
    backgroundColor: "#FF4D4D",
    borderColor: "#FF4D4D",
  },
  actionBtnAccent: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
