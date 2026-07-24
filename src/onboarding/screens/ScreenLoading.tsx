import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInUp,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { colors, fonts } from "../../constants/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const ORB_SIZE = 88;
const ORB_CANVAS = 220;

interface ScreenLoadingProps {
  onComplete: () => void;
}

const STEPS = [
  { label: "BUILDING YOUR PLAN", icon: "barbell" },
  { label: "PREPARING EXPERIENCE", icon: "sparkle" },
  { label: "SETTING UP COACH", icon: "avatar" },
] as const;

const STEP_DELAYS = [200, 1300, 2400];
const COMPLETE_DELAY = 5800;

const BarbellIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
    <Rect x={5} y={10} width={12} height={2} rx={1} fill="rgba(200,241,53,0.7)" />
    <Rect x={2} y={7.5} width={3} height={7} rx={1.5} fill="#c8f135" />
    <Rect x={17} y={7.5} width={3} height={7} rx={1.5} fill="#c8f135" />
  </Svg>
);

const SparkleIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
    <Circle cx={11} cy={11} r={2} fill="#c8f135" />
    <Rect x={10.3} y={3} width={1.4} height={4} rx={0.7} fill="rgba(200,241,53,0.8)" />
    <Rect x={10.3} y={15} width={1.4} height={4} rx={0.7} fill="rgba(200,241,53,0.8)" />
    <Rect x={3} y={10.3} width={4} height={1.4} rx={0.7} fill="rgba(200,241,53,0.8)" />
    <Rect x={15} y={10.3} width={4} height={1.4} rx={0.7} fill="rgba(200,241,53,0.8)" />
  </Svg>
);

const AvatarIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
    <Circle cx={11} cy={8.5} r={3} fill="#c8f135" />
    <Path d="M5 18c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="#c8f135" strokeWidth={1.5} strokeLinecap="round" />
    <Circle cx={11} cy={11} r={9} stroke="rgba(200,241,53,0.35)" strokeWidth={1} fill="none" />
  </Svg>
);

const ICON_MAP: Record<string, React.ReactNode> = {
  barbell: <BarbellIcon />,
  sparkle: <SparkleIcon />,
  avatar: <AvatarIcon />,
};

const BgRing = ({ delay }: { delay: number }) => {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3000, easing: Easing.out(Easing.ease) }), -1, false));
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 0.6 + t.value * 1.6 }],
    opacity: 0.6 * (1 - t.value),
  }));

  return <Animated.View style={[styles.bgRing, style]} />;
};

const Step = ({
  label,
  icon,
  visible,
}: {
  label: string;
  icon: string;
  visible: boolean;
}) => {
  const dot = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      dot.value = withRepeat(
        withSequence(withTiming(0.5, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
        true,
      );
    }
  }, [visible]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: visible ? dot.value : 1,
    transform: [{ scale: visible ? dot.value : 1 }],
  }));

  if (!visible) return null;

  return (
    <Animated.View entering={FadeInUp.duration(400)} style={styles.step}>
      <View style={styles.iconWrap}>{ICON_MAP[icon]}</View>
      <Text style={styles.stepLabel}>{label}</Text>
      <Animated.View style={[styles.statusDot, dotStyle]} />
    </Animated.View>
  );
};

export const ScreenLoading = ({ onComplete }: ScreenLoadingProps) => {
  const [visible, setVisible] = React.useState<boolean[]>([false, false, false]);

  const orbBreath = useSharedValue(0);

  useEffect(() => {
    orbBreath.value = withRepeat(
      withSequence(withTiming(1, { duration: 1000 }), withTiming(0, { duration: 1000 })),
      -1,
      false,
    );
  }, []);

  const sphereProps = useAnimatedProps(() => ({
    r: (ORB_SIZE / 2) * (1 + orbBreath.value * 0.06),
  }));

  const glowProps = useAnimatedProps(() => ({
    r: (ORB_SIZE / 2) * (1.7 + orbBreath.value * 0.5),
    opacity: 0.45 + orbBreath.value * 0.2,
  }));

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    STEP_DELAYS.forEach((delay, i) => {
      timers.push(
        setTimeout(() => {
          setVisible((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }, delay),
      );
    });

    timers.push(setTimeout(onComplete, COMPLETE_DELAY));

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  return (
    <View style={styles.screen}>
      <BgRing delay={0} />
      <BgRing delay={1000} />
      <BgRing delay={2000} />

      <View style={styles.orbWrap}>
        <Svg width={ORB_CANVAS} height={ORB_CANVAS} style={styles.orbCanvas}>
          <Defs>
            <RadialGradient id="orbGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="orbSphere" cx="38%" cy="36%" r="65%">
              <Stop offset="0" stopColor="#c8f135" />
              <Stop offset="0.55" stopColor="#7db800" />
              <Stop offset="1" stopColor="#2a3d00" />
            </RadialGradient>
          </Defs>

          <AnimatedCircle
            cx={ORB_CANVAS / 2}
            cy={ORB_CANVAS / 2}
            fill="url(#orbGlow)"
            animatedProps={glowProps}
          />
          <AnimatedCircle
            cx={ORB_CANVAS / 2}
            cy={ORB_CANVAS / 2}
            fill="url(#orbSphere)"
            animatedProps={sphereProps}
          />
        </Svg>
      </View>

      <View style={styles.steps}>
        {STEPS.map((step, i) => (
          <Step key={step.label} label={step.label} icon={step.icon} visible={visible[i]} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },

  bgRing: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.06)",
  },

  orbWrap: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    marginBottom: 48,
  },

  orbCanvas: {
    position: "absolute",
    top: -(ORB_CANVAS - ORB_SIZE) / 2,
    left: -(ORB_CANVAS - ORB_SIZE) / 2,
  },

  steps: {
    gap: 20,
    width: "100%",
    maxWidth: 280,
  },

  step: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },

  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "rgba(200,241,53,0.1)",
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },

  stepLabel: {
    flex: 1,
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 1,
    color: "rgba(255,255,255,0.85)",
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
