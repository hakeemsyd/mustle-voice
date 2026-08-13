import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useExerciseGuide } from "../hooks/useExerciseGuide";
import { XIcon } from "../icons/XIcon";

interface Props {
  open: boolean;
  onClose: () => void;
  exerciseId: string | null;
  exerciseName: string | null;
  repScheme?: string;
  loadScheme?: string;
}

function whenLabel(iso: string): string {
  const then = new Date(iso);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function GuideSheet({ open, onClose, exerciseId, exerciseName, repScheme, loadScheme }: Props) {
  const insets = useScreenInsets();
  const { loading, notes, lastTime } = useExerciseGuide(open ? exerciseId : null, open ? exerciseName : null);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <XIcon size={15} color={colors.muted} />
          </Pressable>

          <Text style={styles.eyebrow}>EXERCISE GUIDE</Text>
          <Text style={styles.title}>{(exerciseName ?? "Exercise").toUpperCase()}</Text>
          {(repScheme || loadScheme) && (
            <Text style={styles.target}>
              {[repScheme, loadScheme].filter(Boolean).join(" · ")}
            </Text>
          )}

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.sectionLabel}>LAST TIME</Text>
            <View style={styles.card}>
              {loading ? (
                <ActivityIndicator color={colors.accent} />
              ) : lastTime ? (
                <Text style={styles.cardText}>
                  {whenLabel(lastTime.at)} — {lastTime.sets} sets · {lastTime.reps} reps
                  {lastTime.load && lastTime.load !== "bodyweight" ? ` · ${lastTime.load}` : ""}
                </Text>
              ) : (
                <Text style={styles.cardTextMuted}>
                  No logged history for this exercise yet.
                </Text>
              )}
            </View>

            <Text style={styles.sectionLabel}>COACHING NOTES</Text>
            {loading ? (
              <View style={styles.card}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : notes.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTextMuted}>
                  Nothing yet — ask your coach about this exercise mid-set and their answer is
                  kept here.
                </Text>
              </View>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={styles.noteCard}>
                  <Text style={styles.noteWhen}>{whenLabel(note.at)}</Text>
                  <Text style={styles.cardText}>{note.note}</Text>
                </View>
              ))
            )}

            <Text style={styles.sectionLabel}>FORM DEMO</Text>
            <View style={styles.card}>
              <Text style={styles.cardTextMuted}>Video demo — coming soon.</Text>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "82%",
  },
  handleWrap: { alignItems: "center", paddingBottom: 6 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 16,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 2,
  },
  eyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: 0.4,
    color: colors.text,
    marginTop: 2,
  },
  target: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.muted,
    marginTop: 2,
  },
  scroll: { marginTop: 14 },
  scrollContent: { paddingBottom: 8, gap: 8 },
  sectionLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
    marginTop: 6,
  },
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteCard: {
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderLeftWidth: 2,
    borderLeftColor: colors.accent,
  },
  noteWhen: {
    fontFamily: fonts.monoBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.muted,
  },
  cardText: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.text,
  },
  cardTextMuted: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
});
