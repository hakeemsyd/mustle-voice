import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { useScreenInsets } from "../hooks/useScreenInsets";
import { usePlanAlternatives } from "../hooks/usePlanAlternatives";
import { XIcon } from "../icons/XIcon";
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
}

type Step = "confirm" | "pick";

export function SwitchWorkoutSheet({
  open,
  onClose,
  confirmDescription,
  currentPlanSessionId,
  onConfirm,
}: Props) {
  const insets = useScreenInsets();
  const [step, setStep] = useState<Step>("confirm");
  const { alternatives, loading } = usePlanAlternatives(currentPlanSessionId);

  const close = () => {
    setStep("confirm");
    onClose();
  };

  const pick = (target: SessionTarget) => {
    setStep("confirm");
    onConfirm(target);
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
              <Pressable style={styles.confirmBtn} onPress={() => setStep("pick")}>
                <Text style={styles.confirmText}>Yes, switch workout</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={close}>
                <Text style={styles.cancelText}>Keep current plan</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.wrap}>
              <Text style={styles.eyebrow}>SWITCH WORKOUT</Text>
              <Text style={styles.title}>PICK A NEW SESSION</Text>

              <ScrollView style={styles.pickScroll} contentContainerStyle={styles.pickContent}>
                <Text style={styles.groupLabel}>FROM YOUR PLAN</Text>
                {loading ? (
                  <ActivityIndicator color={colors.accent} style={styles.loader} />
                ) : alternatives.length === 0 ? (
                  <Text style={styles.emptyNote}>
                    No other strength sessions in your plan — pick a cardio session below.
                  </Text>
                ) : (
                  alternatives.map((alt) => (
                    <Pressable
                      key={alt.planSessionId}
                      style={styles.typeCard}
                      onPress={() => pick({ type: "strength", planSessionId: alt.planSessionId })}
                    >
                      <View style={styles.typeCardText}>
                        <Text style={styles.typeCardTitle}>{alt.focus.toUpperCase()}</Text>
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
          )}
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
