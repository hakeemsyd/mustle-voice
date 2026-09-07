import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { CheckIcon } from "../icons/CheckIcon";
import { PlayIcon } from "../icons/PlayIcon";
import { StopIcon } from "../icons/StopIcon";
import { SlidersIcon } from "../icons/SlidersIcon";

export interface SessionControlsMenuProps {
  open: boolean;
  onClose: () => void;
  /** Omitted during rest or a cardio session, where there's no set to complete. */
  onSetDone?: () => void;
  /** The rest-phase counterpart — ends rest early and begins the next set. */
  onStartSet?: () => void;
  startSetLabel?: string;
  onWorkoutDone: () => void;
  onManageWorkout: () => void;
}

/**
 * The Active Session card's one control, opened by its "…" button — a centred white action card
 * over a near-opaque backdrop, with Cancel as its own separate pill below rather than a fourth
 * row. Replaces the per-control buttons that used to live on the card itself.
 */
export function SessionControlsMenu({
  open,
  onClose,
  onSetDone,
  onStartSet,
  startSetLabel = "Start set",
  onWorkoutDone,
  onManageWorkout,
}: SessionControlsMenuProps) {
  const rows = [
    ...(onSetDone ? [{ key: "set", label: "Set done", Icon: CheckIcon, onPress: onSetDone }] : []),
    ...(onStartSet ? [{ key: "start", label: startSetLabel, Icon: PlayIcon, onPress: onStartSet }] : []),
    { key: "workout", label: "Workout done", Icon: StopIcon, onPress: onWorkoutDone },
    { key: "manage", label: "Manage workout", Icon: SlidersIcon, onPress: onManageWorkout },
  ];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.menu} onPress={(e) => e.stopPropagation()}>
          <View style={styles.card}>
            {rows.map(({ key, label, Icon, onPress }, i) => (
              <Pressable
                key={key}
                style={[styles.row, i > 0 && styles.rowDivided]}
                onPress={() => {
                  onClose();
                  onPress();
                }}
              >
                <View style={styles.rowIcon}>
                  <Icon size={17} color={colors.text} />
                </View>
                <Text style={styles.rowLabel}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(8,8,8,0.94)",
  },
  menu: {
    width: "100%",
    maxWidth: 340,
    gap: 22,
  },
  card: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0A0A0A",
  },
  rowLabel: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: "#0A0A0A",
  },
  cancelBtn: {
    height: 56,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceDeep,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 15,
    color: colors.text,
  },
});
