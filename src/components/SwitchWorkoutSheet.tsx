import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { usePlanAlternatives, type PlanAlternativeExercise } from "../hooks/usePlanAlternatives";
import { XIcon } from "../icons/XIcon";
import { titleCase } from "../lib/textFormat";
import type { SessionTarget } from "../session/ActiveSessionContext";

export const CARDIO_ACTIVITIES = ["Run", "Bike", "Hike", "Walk"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Differs by entry point — mid-session warns about the in-progress log, pre-session
   *  just cancels a plan nothing has started on yet. */
  confirmDescription: string;
  currentPlanSessionId?: string;
  onConfirm: (target: SessionTarget) => void;
  /** Take today as a rest day instead of switching to another session — deliberately a
   *  separate callback from onConfirm since it doesn't produce a SessionTarget to start. */
  onRestDay: () => void;
  onProceedToChat?: () => void;
}

type Step = "confirm" | "pick" | "preview";

interface PreviewTarget {
  target: SessionTarget;
  label: string;
  exercises: PlanAlternativeExercise[];
}

export function SwitchWorkoutSheet({
  open,
  onClose,
  confirmDescription,
  currentPlanSessionId,
  onConfirm,
  onRestDay,
  onProceedToChat,
}: Props) {
  const insets = useScreenInsets();
  const [step, setStep] = useState<Step>("confirm");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const { alternatives, loading } = usePlanAlternatives(currentPlanSessionId);

  const close = () => {
    setStep("confirm");
    setPreviewTarget(null);
    onClose();
  };

  const pick = (target: SessionTarget) => {
    setStep("confirm");
    setPreviewTarget(null);
    onConfirm(target);
  };

  const openPreview = (alt: { planSessionId: string; focus: string; exercises: PlanAlternativeExercise[] }) => {
    setPreviewTarget({
      target: { type: "strength", planSessionId: alt.planSessionId },
      label: alt.focus,
      exercises: alt.exercises,
    });
    setStep("preview");
  };

  const takeRestDay = () => {
    setStep("confirm");
    setPreviewTarget(null);
    onRestDay();
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

          {step === "confirm" ? (
            <View style={styles.wrap}>
              <Text style={styles.eyebrow}>SWITCH WORKOUT</Text>
              <Text style={styles.title}>CANCEL THIS SESSION?</Text>
              <Text style={styles.description}>{confirmDescription}</Text>
              <Pressable
                style={styles.confirmBtn}
                onPress={() => (onProceedToChat ? onProceedToChat() : setStep("pick"))}
              >
                <Text style={styles.confirmText}>Yes, switch workout</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={close}>
                <Text style={styles.cancelText}>Keep current plan</Text>
              </Pressable>
            </View>
          ) : step === "pick" ? (
            <View style={styles.wrap}>
              <Text style={styles.eyebrow}>SWITCH WORKOUT</Text>
              <Text style={styles.title}>PICK A NEW SESSION</Text>

              <ScrollView style={styles.pickScroll} contentContainerStyle={styles.pickContent}>
                <Pressable style={styles.restDayCard} onPress={takeRestDay}>
                  <View style={styles.typeCardText}>
                    <Text style={styles.restDayTitle}>TAKE A REST DAY</Text>
                    <Text style={styles.typeCardSub}>Skip today — nothing else on your plan changes.</Text>
                  </View>
                  <Text style={styles.typeCardArrow}>→</Text>
                </Pressable>

                <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>FROM YOUR PLAN</Text>
                {loading ? (
                  <ActivityIndicator color={colors.accent} style={styles.loader} />
                ) : alternatives.length === 0 ? (
                  <Text style={styles.emptyNote}>
                    No other strength sessions in your plan — pick a cardio session below.
                  </Text>
                ) : (
                  alternatives.map((alt) => (
                    <Pressable key={alt.planSessionId} style={styles.typeCard} onPress={() => openPreview(alt)}>
                      <View style={styles.typeCardText}>
                        <Text style={styles.typeCardTitle}>{titleCase(alt.focus)}</Text>
                        <Text style={styles.typeCardSub}>{alt.exerciseCount} exercises</Text>
                      </View>
                      <Text style={styles.typeCardArrow}>→</Text>
                    </Pressable>
                  ))
                )}

                <Text style={[styles.groupLabel, styles.groupLabelSpaced]}>CARDIO</Text>
                <View style={styles.cardioChips}>
                  {CARDIO_ACTIVITIES.map((activity) => (
                    <Pressable
                      key={activity}
                      style={styles.cardioChip}
                      onPress={() => pick({ type: "cardio", activity })}
                    >
                      <Text style={styles.cardioChipText}>{activity}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : previewTarget ? (
            <View style={styles.wrap}>
              <Text style={styles.eyebrow}>SWITCH WORKOUT</Text>
              <Text style={styles.title}>{titleCase(previewTarget.label)}</Text>

              <ScrollView style={styles.pickScroll} contentContainerStyle={styles.pickContent}>
                <Text style={styles.groupLabel}>EXERCISES</Text>
                {previewTarget.exercises.map((exercise, i) => (
                  <View key={`${exercise.name}-${i}`} style={styles.previewRow}>
                    <Text style={styles.previewIndex}>{String(i + 1).padStart(2, "0")}</Text>
                    <Text style={styles.previewName} numberOfLines={1}>
                      {exercise.name}
                    </Text>
                    <Text style={styles.previewMeta}>
                      {exercise.sets} × {exercise.repScheme}
                    </Text>
                  </View>
                ))}
              </ScrollView>

              <Pressable style={styles.confirmBtn} onPress={() => pick(previewTarget.target)}>
                <Text style={styles.confirmText}>Start This Instead</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => setStep("pick")}>
                <Text style={styles.cancelText}>Back</Text>
              </Pressable>
            </View>
          ) : null}
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
    textTransform: "uppercase",
  },
  description: {
    fontFamily: fonts.body,
    fontSize: 13.5,
    lineHeight: 21,
    color: colors.muted,
    marginBottom: 6,
  },
  confirmBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  confirmText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: colors.accentOn,
  },
  cancelBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.muted,
  },
  pickScroll: { marginTop: 2 },
  pickContent: { paddingBottom: 8, gap: 8 },
  groupLabel: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.muted,
  },
  groupLabelSpaced: { marginTop: 10 },
  loader: { alignSelf: "flex-start", marginVertical: 8 },
  emptyNote: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.muted,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeCardText: { flex: 1, gap: 2 },
  typeCardTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 0.3,
    color: colors.text,
    textTransform: "uppercase",
  },
  typeCardSub: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
  },
  typeCardArrow: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.muted,
  },
  restDayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentBorder,
  },
  restDayTitle: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 0.3,
    color: colors.accent,
  },
  previewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  previewIndex: {
    width: 18,
    fontFamily: fonts.bodySemiBold,
    fontSize: 11,
    color: colors.muted,
  },
  previewName: {
    flex: 1,
    fontFamily: fonts.bodySemiBold,
    fontSize: 13.5,
    color: colors.text,
  },
  previewMeta: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    textAlign: "right",
  },
  cardioChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardioChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardioChipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 13,
    color: colors.text,
  },
});
