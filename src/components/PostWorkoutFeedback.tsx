import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { colors, fonts } from "../constants/theme";

/** Why a session ended early — the short version asked after a partial run. */
const PARTIAL_TAGS = ["Ran out of time", "Too tired", "Felt pain", "Gym too busy", "Changed plans"];

/** How a completed session felt — offered alongside the open-ended prompt. */
const COMPLETED_TAGS = ["Felt strong", "Tough but good", "Too easy", "Too heavy", "Off day"];

interface Props {
  status: "completed" | "partial";
  saving: boolean;
  onSubmit: (note: string, tags: string[]) => void;
  onSkip: () => void;
}

export function PostWorkoutFeedback({ status, saving, onSubmit, onSkip }: Props) {
  const isPartial = status === "partial";
  const tags = isPartial ? PARTIAL_TAGS : COMPLETED_TAGS;
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const toggle = (tag: string) =>
    setSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));

  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>{isPartial ? "SESSION SAVED" : "NICE WORK"}</Text>
      <Text style={styles.title}>{isPartial ? "WHAT CUT IT SHORT?" : "HOW DID THAT FEEL?"}</Text>

      <View style={styles.chips}>
        {tags.map((tag) => {
          const on = selected.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => toggle(tag)}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{tag}</Text>
            </Pressable>
          );
        })}
      </View>

      {!isPartial && (
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="Anything your coach should know for next time?"
          placeholderTextColor={colors.muted}
          multiline
        />
      )}

      <Pressable
        style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
        disabled={saving}
        onPress={() => onSubmit(note, selected)}
      >
        <Text style={styles.submitText}>{saving ? "Saving…" : "Save & finish"}</Text>
      </Pressable>
      <Pressable style={styles.skipBtn} onPress={onSkip} disabled={saving}>
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 10,
  },
  eyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 0.4,
    color: colors.text,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentBorderStrong,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12.5,
    color: colors.muted,
  },
  chipTextOn: {
    color: colors.accent,
  },
  input: {
    minHeight: 84,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 20,
    color: colors.text,
    textAlignVertical: "top",
  },
  submitBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginTop: 2,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accentOn,
  },
  skipBtn: {
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.muted,
  },
});
