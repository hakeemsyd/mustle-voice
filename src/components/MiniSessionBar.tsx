import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { colors, fonts } from "../constants/theme";
import { StopIcon } from "../icons/StopIcon";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { useRestRemaining } from "../hooks/useRestRemaining";
import type { RootStackParamList } from "../navigation/types";
import { ConfirmSheet } from "./ConfirmSheet";

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * The "session still running" pill. Mounted once above the tab bar, it appears only while
 * a session is running AND minimized — tapping it restores the full Active Session screen.
 * The stop button is the genuine end-workout path, deliberately distinct from minimize,
 * and always confirms first.
 */
export function MiniSessionBar({ bottomOffset }: { bottomOffset: number }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const session = useActiveSessionContext();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Called unconditionally, before the early return below — same rule as any other hook.
  const restRemaining = useRestRemaining(session.restEndAt, session.restPausedRemainingSec);

  if (!session.running || !session.minimized || !session.target) return null;

  const label =
    session.target.type === "cardio"
      ? session.target.activity
      : (session.currentExercise?.name ?? session.focus ?? "Session");
  const isCardio = session.target.type === "cardio";

  const setsDone =
    session.loggedSets[session.currentExerciseIndex]?.length ?? 0;
  const totalSets = session.currentExercise?.sets ?? 0;

  const statusLine = isCardio
    ? `${formatClock(session.elapsedSec)} elapsed · in progress`
    : session.resting
      ? `Resting · ${formatClock(restRemaining)}`
      : `Set ${setsDone + 1} of ${totalSets} · in progress`;

  const restore = () => {
    session.restore();
    navigation.navigate("ActiveSession");
  };

  return (
    <>
      <Pressable
        style={[styles.bar, { bottom: bottomOffset }]}
        onPress={restore}
      >
        <View
          style={[styles.pulseDot, session.resting && styles.pulseDotRest]}
        />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>
            {label.toUpperCase()}
          </Text>
          <Text style={styles.status}>{statusLine}</Text>
        </View>
        <View style={styles.resumeChip}>
          <Text style={styles.resumeText}>RESUME</Text>
        </View>
        <Pressable
          style={styles.endBtn}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
        >
          <StopIcon size={11} color={colors.muted} />
        </Pressable>
      </Pressable>

      <ConfirmSheet
        open={confirmOpen}
        title="Are you sure you're done for today?"
        description={
          isCardio
            ? `You've been going for ${formatClock(session.elapsedSec)}. Ending now saves this session as completed.`
            : session.hasLoggedAnySet
              ? `You've logged ${setsDone} of ${totalSets} sets on ${label.toLowerCase()}. Ending now saves this as a partial session.`
              : "Ending now saves this as a partial session — nothing's been logged yet."
        }
        confirmLabel="End workout"
        cancelLabel="Keep going"
        destructive
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          // With nothing logged there's no row to write or attach feedback to, so drop the
          // session where it stands instead of reopening the screen for a dead-end prompt.
          if (!isCardio && !session.hasLoggedAnySet) {
            session.clear();
            return;
          }
          session.restore();
          navigation.navigate("ActiveSession");
          void session.endSession(isCardio ? "completed" : "partial");
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(20,20,20,0.97)",
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  pulseDotRest: {
    backgroundColor: colors.chartCarbs,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 0.3,
    color: colors.text,
  },
  status: {
    fontFamily: fonts.body,
    fontSize: 10.5,
    color: colors.muted,
  },
  resumeChip: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.accent,
  },
  resumeText: {
    fontFamily: fonts.monoBold,
    fontSize: 10,
    letterSpacing: 0.6,
    color: colors.accentOn,
  },
  endBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
});
