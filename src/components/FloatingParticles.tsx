import React, { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors } from '../constants/theme';

const PARTICLES = [
  { left: '14%', size: 2, duration: 3500, delay: 0 },
  { left: '27%', size: 3, duration: 4200, delay: 800 },
  { left: '41%', size: 2, duration: 3800, delay: 1500 },
  { left: '55%', size: 3, duration: 4500, delay: 300 },
  { left: '67%', size: 2, duration: 3200, delay: 1200 },
  { left: '79%', size: 3, duration: 4000, delay: 600 },
  { left: '22%', size: 4, duration: 3600, delay: 2000 },
  { left: '73%', size: 2, duration: 4800, delay: 1800 },
] as const;

function Particle({
  left,
  size,
  duration,
  delay,
}: {
  left: DimensionValue;
  size: number;
  duration: number;
  delay: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, []);

  const style = useAnimatedStyle(() => {
    const fadeIn = t.value < 0.1 ? t.value / 0.1 : 1;
    const fadeOut = t.value > 0.8 ? 1 - (t.value - 0.8) / 0.2 : 1;
    return {
      opacity: 0.7 * fadeIn * fadeOut,
      transform: [{ translateY: -t.value * 260 }],
    };
  });

  return (
    <Animated.View
      style={[styles.particle, { left, width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

export function FloatingParticles() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {PARTICLES.map((p, i) => (
        <Particle key={i} left={p.left} size={p.size} duration={p.duration} delay={p.delay} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: { position: 'absolute', bottom: 0, backgroundColor: colors.accent },
});
