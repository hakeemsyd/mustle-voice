import React from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { useExerciseGuide } from "../hooks/useExerciseGuide";
import { getExerciseReference } from "../lib/exerciseGuides";
import { ExerciseMotionIllustration } from "./ExerciseMotionIllustration";
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

/**
 * Guide — a reference layer for one exercise: what the movement is, what it works, and how to
 * set up and execute it, on a white card over the app's own dark background. Full-screen rather
 * than a bottom sheet; the header travels with the content as a pinned bar.
 *
 * Reference content comes from src/lib/exerciseGuides.ts. The user's own logged history and the
 * coach's past notes are appended below it, but only when they exist — an exercise the user has
 * never logged shows pure reference material rather than two empty placeholder cards.
 */
export function GuideSheet({ open, onClose, exerciseId, exerciseName, repScheme, loadScheme }: Props) {
  const insets = useScreenInsets();
  const { loading, notes, lastTime } = useExerciseGuide(open ? exerciseId : null, open ? exerciseName : null);
  const reference = getExerciseReference(exerciseName);

  return (
    <Modal visible={open} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.stickyBar, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>GUIDE</Text>
            <Text style={styles.title} numberOfLines={2}>
              {(exerciseName ?? "Exercise").toUpperCase()}
            </Text>
            {(repScheme || loadScheme) && (
              <Text style={styles.target}>{[repScheme, loadScheme].filter(Boolean).join(" · ")}</Text>
            )}
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
            <XIcon size={15} color={colors.muted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]}
          showsVerticalScrollIndicator={false}
        >
          {reference ? (
            <>
              <View style={styles.guideCard}>
                <ExerciseMotionIllustration motion={reference.motion} />
                <Text style={styles.guideSummary}>{reference.summary}</Text>
                <View style={styles.muscleRow}>
                  {reference.muscles.map((muscle) => (
                    <Text key={muscle} style={styles.muscleChip}>
                      {muscle.toUpperCase()}
                    </Text>
                  ))}
                </View>
              </View>

              {/* Deliberately outside the white card, on the screen's own dark background. */}
              <View style={styles.stepBlock}>
                <Text style={styles.stepLabel}>SETUP</Text>
                <View style={styles.stepList}>
                  {reference.setup.map((step, i) => (
                    <View key={i} style={styles.stepItemRow}>
                      <Text style={styles.stepBullet}>•</Text>
                      <Text style={styles.stepItem}>{step}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.stepBlock, styles.stepBlockDivided]}>
                <Text style={styles.stepLabel}>EXECUTION</Text>
                <View style={styles.stepList}>
                  {reference.execution.map((step, i) => (
                    <View key={i} style={styles.stepItemRow}>
                      <Text style={styles.stepBullet}>•</Text>
                      <Text style={styles.stepItem}>{step}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTextMuted}>No reference notes for this exercise yet.</Text>
            </View>
          )}

          {loading ? (
            <ActivityIndicator color={colors.accent} style={styles.spinner} />
          ) : (
            <>
              {lastTime && (
                <View style={[styles.stepBlock, styles.stepBlockDivided]}>
                  <Text style={styles.stepLabel}>LAST TIME</Text>
                  <Text style={styles.cardText}>
                    {whenLabel(lastTime.at)} — {lastTime.sets} sets · {lastTime.reps} reps
                    {lastTime.load && lastTime.load !== "bodyweight" ? ` · ${lastTime.load}` : ""}
                  </Text>
                </View>
              )}

              {notes.length > 0 && (
                <View style={[styles.stepBlock, styles.stepBlockDivided]}>
                  <Text style={styles.stepLabel}>YOUR COACH'S NOTES</Text>
                  {notes.map((note) => (
                    <View key={note.id} style={styles.noteCard}>
                      <Text style={styles.noteWhen}>{whenLabel(note.at)}</Text>
                      <Text style={styles.cardText}>{note.note}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  stickyBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: colors.bg,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrow: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 0.44,
    color: colors.text,
  },
  target: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    color: colors.muted,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 14,
  },

  // White reference card — literal near-black text colours rather than theme tokens, since this
  // is the one light surface on the screen.
  guideCard: {
    gap: 12,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  guideSummary: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: "#0C0C0C",
  },
  muscleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  muscleChip: {
    overflow: "hidden",
    fontFamily: fonts.monoBold,
    fontSize: 9.5,
    letterSpacing: 0.57,
    color: "rgba(8,8,8,0.55)",
    backgroundColor: "rgba(8,8,8,0.06)",
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },

  stepBlock: {
    gap: 6,
  },
  stepBlockDivided: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stepLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
  },
  stepList: {
    gap: 6,
  },
  stepItemRow: {
    flexDirection: "row",
    gap: 8,
    paddingLeft: 4,
  },
  stepBullet: {
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.muted,
  },
  stepItem: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 12.5,
    lineHeight: 19,
    color: colors.text,
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
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    fontSize: 13,
    lineHeight: 20,
    color: colors.text,
  },
  cardTextMuted: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  spinner: {
    marginTop: 8,
  },
});
