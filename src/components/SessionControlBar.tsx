import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts } from "../constants/theme";
import { CheckIcon, StopIcon, SwitchIcon } from "../icons";

interface SessionControlBarProps {
  onDoneTap: () => void;
  /** Disabled (not hidden — keeps the bar's shape stable) when completing a
   *  set doesn't make sense, e.g. mid-rest. */
  doneEnabled: boolean;
  onEndTap: () => void;
  /** Omitted for cardio, where there's no set to log and nothing to swap. */
  onManageTap?: () => void;
}

// Everything that acts on the session itself, in one lime pill — the
// counterpart to SessionInputBar's neutral chat bar above it ("one bar to
// talk, one bar to act"). Manage is the design's third segment, opening
// Switch Workout.
export const SessionControlBar = ({
  onDoneTap,
  doneEnabled,
  onEndTap,
  onManageTap,
}: SessionControlBarProps) => {
  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Pressable
          style={[styles.btn, styles.divider, !doneEnabled && styles.btnDisabled]}
          onPress={onDoneTap}
          disabled={!doneEnabled}
        >
          <CheckIcon size={15} color={colors.accentOn} />
          <Text style={styles.btnText}>Done set</Text>
        </Pressable>

        {onManageTap && (
          <Pressable style={[styles.btn, styles.divider]} onPress={onManageTap}>
            <SwitchIcon size={14} color={colors.accentOn} />
            <Text style={styles.btnText}>Manage</Text>
          </Pressable>
        )}

        <Pressable style={styles.btn} onPress={onEndTap}>
          <StopIcon size={12} color={colors.accentOn} />
          <Text style={[styles.btnText, styles.endText]}>End</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 16,
  },
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    overflow: "hidden",
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  divider: {
    borderRightWidth: 1,
    borderRightColor: "rgba(0,0,0,0.15)",
  },
  btnDisabled: {
    opacity: 0.4,
  },
  btnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.accentOn,
  },
  endText: {
    fontFamily: fonts.bodySemiBold,
    opacity: 0.85,
  },
});
