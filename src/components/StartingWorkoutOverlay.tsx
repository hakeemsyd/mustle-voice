import React, { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { fonts, sessionColors } from "../constants/theme";
import { MMark } from "../icons/MMark";

interface StartingWorkoutOverlayProps {
  open: boolean;
  onComplete: () => void;
}

export function StartingWorkoutOverlay({ open, onComplete }: StartingWorkoutOverlayProps) {
  const iconScale = useSharedValue(0.6);
  const iconOpacity = useSharedValue(0);
  const textOpacity = useSharedValue(0);
  const textTranslate = useSharedValue(10);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!open) {
      firedRef.current = false;
      iconScale.value = 0.6;
      iconOpacity.value = 0;
      textOpacity.value = 0;
      textTranslate.value = 10;
      return;
    }

    iconOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
    iconScale.value = withSequence(
      withTiming(1.08, { duration: 320, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
    );
    textOpacity.value = withDelay(450, withTiming(1, { duration: 320 }));
    textTranslate.value = withDelay(
      450,
      withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) }),
    );

    const timer = setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      onCompleteRef.current();
    }, 3000);

    return () => clearTimeout(timer);
  }, [open]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslate.value }],
  }));

  if (!open) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View style={iconStyle}>
        <MMark size={64} color={sessionColors.activeOn} />
      </Animated.View>
      <Animated.View style={textStyle}>
        <Text style={styles.text}>Starting your workout</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 600,
    backgroundColor: sessionColors.active,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  text: {
    fontFamily: fonts.display,
    fontSize: 22,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: sessionColors.activeOn,
  },
});
