import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface ParticleSpec {
  id: number;
  xPct: number;
  yPct: number;
  size: number;
  durationMs: number;
  opacity: number;
}

const randomParticles = (count: number): ParticleSpec[] =>
  Array.from({ length: count }, (_, id) => ({
    id,
    xPct: 5 + Math.random() * 90,
    yPct: 5 + Math.random() * 90,
    size: 3 + Math.random() * 2.5,
    durationMs: (8 + Math.random() * 10) * 1000,
    opacity: 0.15 + Math.random() * 0.15,
  }));

const Particle = ({ spec }: { spec: ParticleSpec }) => {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: spec.durationMs, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [t, spec.durationMs]);

  const style = useAnimatedStyle(() => {
    const translateX = interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, 8, -12, 6, 0]);
    const translateY = interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, -18, -8, 14, 0]);
    return { transform: [{ translateX }, { translateY }] };
  });

  return (
    <Animated.View
      style={[
        styles.particle,
        style,
        {
          left: `${spec.xPct}%`,
          top: `${spec.yPct}%`,
          width: spec.size,
          height: spec.size,
          borderRadius: spec.size / 2,
          opacity: spec.opacity,
        },
      ]}
    />
  );
};

interface SplashParticlesProps {
  count?: number;
}

export const SplashParticles = ({ count = 14 }: SplashParticlesProps) => {
  const particles = useMemo(() => randomParticles(count), [count]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Particle key={p.id} spec={p} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  particle: { position: 'absolute', backgroundColor: '#080808' },
});
