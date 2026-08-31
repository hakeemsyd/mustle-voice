import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../constants/theme";
import { MMark } from "../icons/MMark";

interface FloatingCoachButtonProps {
  bottomOffset: number;
  onPress: () => void;
}

export function FloatingCoachButton({ bottomOffset, onPress }: FloatingCoachButtonProps) {
  const enter = useSharedValue(0);
  const glow = useSharedValue(0);
  const pressed = useSharedValue(1);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 220 });
    glow.value = withDelay(
      220,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, []);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 8 }, { scale: pressed.value }],
    shadowOpacity: 0.4 + glow.value * 0.25,
    shadowRadius: 20 + glow.value * 8,
  }));

  return (
    <Animated.View style={[styles.wrap, { bottom: bottomOffset }, wrapStyle]}>
      <Pressable
        style={styles.btn}
        onPress={onPress}
        onPressIn={() => (pressed.value = withTiming(0.94, { duration: 100 }))}
        onPressOut={() => (pressed.value = withTiming(1, { duration: 150 }))}
        hitSlop={8}
      >
        <MMark size={20} color={colors.accent} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 20,
    zIndex: 16,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  btn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    borderWidth: 5,
    borderColor: colors.accent,
  },
});
