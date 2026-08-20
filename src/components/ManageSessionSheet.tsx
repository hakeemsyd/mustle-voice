import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { getSwapCandidates, type SwapCandidate } from "../session/exerciseSwap";
import type { SessionExercise } from "../session/ActiveSessionContext";
import { SwitchIcon, XIcon } from "../icons";

interface ManageSessionSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  isCardio: boolean;
  exercises: SessionExercise[];
  currentExerciseIndex: number;
  onRemove: (exerciseRowId: string) => void;
  onSwap: (exerciseRowId: string, replacement: SwapCandidate) => void;
  onSwitchWorkout: () => void;
}

export function ManageSessionSheet({
  open,
  onClose,
  userId,
  isCardio,
  exercises,
  currentExerciseIndex,
  onRemove,
  onSwap,
  onSwitchWorkout,
}: ManageSessionSheetProps) {
  const insets = useScreenInsets();
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<SwapCandidate[]>([]);
  const [loadingFor, setLoadingFor] = useState<string | null>(null);

  const upcoming = exercises.slice(currentExerciseIndex + 1);

  const close = () => {
    setPickerFor(null);
    onClose();
  };

  const openPicker = async (exercise: SessionExercise) => {
    if (!userId) return;
    setPickerFor(exercise.id);
    setCandidates([]);
    setLoadingFor(exercise.id);
    const result = await getSwapCandidates(userId, exercise.exerciseId);
    setLoadingFor(null);
    setCandidates(result);
  };

  const confirmSwap = (exerciseRowId: string, candidate: SwapCandidate) => {
    onSwap(exerciseRowId, candidate);
    setPickerFor(null);
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>
          <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
            <XIcon size={15} color={colors.muted} />
          </Pressable>

          <View style={styles.wrap}>
            <Text style={styles.eyebrow}>MANAGE SESSION</Text>
            <Text style={styles.title}>CHANGE EXERCISE</Text>

            {isCardio ? (
              <Text style={styles.emptyNote}>Nothing to change here — timer-based, no queue.</Text>
            ) : upcoming.length === 0 ? (
              <Text style={styles.emptyNote}>No upcoming exercises — nothing left to swap or remove.</Text>
            ) : (
              <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
                {upcoming.map((exercise) => (
                  <View key={exercise.id} style={styles.row}>
                    <View style={styles.rowMain}>
                      <View style={styles.rowText}>
                        <Text style={styles.rowName}>{exercise.name}</Text>
                        <Text style={styles.rowMeta}>
                          {exercise.sets} × {exercise.repScheme}
                        </Text>
                      </View>
                      {loadingFor === exercise.id ? (
                        <ActivityIndicator size="small" color={colors.muted} />
                      ) : (
                        <View style={styles.rowActions}>
                          <Pressable style={styles.actionBtn} onPress={() => openPicker(exercise)} hitSlop={8}>
                            <SwitchIcon size={14} color={colors.text} />
                          </Pressable>
                          <Pressable
                            style={styles.actionBtn}
                            onPress={() => onRemove(exercise.id)}
                            hitSlop={8}
                          >
                            <XIcon size={14} color="#ff6b5e" />
                          </Pressable>
                        </View>
                      )}
                    </View>

                    {pickerFor === exercise.id && candidates.length > 0 && (
                      <View style={styles.swapPicker}>
                        {candidates.map((candidate) => (
                          <Pressable
                            key={candidate.id}
                            style={styles.swapOption}
                            onPress={() => confirmSwap(exercise.id, candidate)}
                          >
                            <Text style={styles.swapOptionText}>{candidate.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                    {pickerFor === exercise.id && loadingFor === null && candidates.length === 0 && (
                      <Text style={styles.noAlternates}>No safe alternates found for this exercise.</Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}

            <Pressable style={styles.switchBtn} onPress={onSwitchWorkout}>
              <Text style={styles.switchBtnText}>Switch entire workout instead</Text>
            </Pressable>
          </View>
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
    maxHeight: "75%",
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
  },
  wrap: { gap: 10 },
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
    marginBottom: 4,
  },
  emptyNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
    marginBottom: 8,
  },
  scroll: { maxHeight: 320 },
  scrollContent: { gap: 8, paddingBottom: 4 },
  row: {
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  rowMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowText: { flex: 1, gap: 2 },
  rowName: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  rowMeta: {
    fontFamily: fonts.body,
    fontSize: 11.5,
    color: colors.muted,
  },
  rowActions: {
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swapPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  swapOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  swapOptionText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.text,
  },
  noAlternates: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  switchBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 4,
  },
  switchBtnText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.muted,
  },
});
