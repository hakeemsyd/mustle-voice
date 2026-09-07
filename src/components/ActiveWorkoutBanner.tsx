import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { fonts, sessionColors } from "../constants/theme";
import { ChevronRightIcon } from "../icons";
import { useActiveSessionContext } from "../session/ActiveSessionContext";
import { useRestRemaining } from "../hooks/useRestRemaining";
import { titleCase } from "../lib/textFormat";
import { formatClock } from "../lib/formatClock";
import type { RootStackParamList } from "../navigation/types";

export function ActiveWorkoutBanner() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const session = useActiveSessionContext();
  const restRemaining = useRestRemaining(session.restEndAt, session.restPausedRemainingSec);

  const mountProgress = useSharedValue(0);
  useEffect(() => {
    mountProgress.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
  }, []);
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mountProgress.value,
    transform: [{ translateY: 6 * (1 - mountProgress.value) }],
  }));

  if (!session.running || !session.minimized || !session.target) return null;

  const target = session.target;
  // Two segments joined by a chevron — workout name, then either the exercise in progress or a
  // live rest countdown — not one flat string. Cardio has no second segment (its own activity
  // name already reads as the whole identity, same as the reference's own cardioLabel handling).
  const workoutLabel = target.type === "cardio" ? target.activity : (session.focus ? titleCase(session.focus) : "Session");
  const exerciseLabel =
    target.type === "cardio"
      ? null
      : session.resting
        ? `Rest — ${formatClock(restRemaining)}`
        : session.currentExercise?.name ?? null;

  const restore = () => {
    session.restore();
    navigation.navigate("ActiveSession");
  };

  return (
    <Animated.View style={mountStyle}>
      <Pressable
        style={[
          styles.banner,
          { backgroundColor: session.resting ? sessionColors.rest : sessionColors.active },
        ]}
        onPress={restore}
      >
        <View style={styles.text}>
          <View style={styles.eyebrowRow}>
            <View style={styles.liveDot} />
            <Text style={styles.eyebrow}>WORKOUT ACTIVE</Text>
          </View>
          <View style={styles.titleRow}>
            <Text style={[styles.title, styles.titleSegmentFirst]} numberOfLines={1}>
              {workoutLabel}
            </Text>
            {exerciseLabel && (
              <>
                <ChevronRightIcon size={12} color="rgba(10,10,10,0.45)" />
                <Text style={[styles.title, styles.titleSegmentLast]} numberOfLines={1}>
                  {exerciseLabel}
                </Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.continueBtn}>
          <ChevronRightIcon size={16} color={session.resting ? "#FFFFFF" : sessionColors.active} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    // Always black (sessionColors.activeOn === restOn) — the reference never swaps this text
    // black for white between phases, since black reads fine on the red background too.
    backgroundColor: sessionColors.activeOn,
  },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 9.5,
    letterSpacing: 1.1,
    color: sessionColors.activeOn,
    opacity: 0.6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 16,
    letterSpacing: 0.3,
    color: sessionColors.activeOn,
  },
  // The workout-name segment yields its space first when both don't fit — the exercise/rest
  // segment is the more useful half once a session is actually underway.
  titleSegmentFirst: {
    flexShrink: 3,
    minWidth: 0,
  },
  titleSegmentLast: {
    flexShrink: 1,
    minWidth: 0,
  },
  continueBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    // Always black — only the chevron icon's color swaps between phases (see the icon color
    // prop above), matching the reference exactly.
    backgroundColor: sessionColors.activeOn,
  },
});
