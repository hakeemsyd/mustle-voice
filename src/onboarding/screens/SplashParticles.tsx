import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
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
  /** 0-1 fraction of its own loop to start already into, in ms — approximates the source
   *  design's negative CSS animation-delay (`delay: -(Math.random() * 10)`), which makes each
   *  particle look like it's already mid-cycle from the very first frame instead of every
   *  particle starting from the same resting position in lockstep. Reanimated has no direct
   *  equivalent of a negative delay, so this is simulated as a positive delay before each
   *  particle's own loop begins — same desynchronized result once the screen's been up a moment. */
  startDelayMs: number;
}

interface RandomRange {
  min: number;
  max: number;
}

const randomParticles = (
  count: number,
  opacityRange: RandomRange,
  durationSecRange: RandomRange,
): ParticleSpec[] =>
  Array.from({ length: count }, (_, id) => {
    const durationMs = (durationSecRange.min + Math.random() * (durationSecRange.max - durationSecRange.min)) * 1000;
    return {
      id,
      xPct: 5 + Math.random() * 90,
      yPct: 5 + Math.random() * 90,
      size: 3 + Math.random() * 2.5,
      durationMs,
      opacity: opacityRange.min + Math.random() * (opacityRange.max - opacityRange.min),
      startDelayMs: Math.random() * durationMs,
    };
  });

const Particle = ({ spec, color }: { spec: ParticleSpec; color: string }) => {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      spec.startDelayMs,
      withRepeat(withTiming(1, { duration: spec.durationMs, easing: Easing.inOut(Easing.quad) }), -1, false),
    );
  }, [t, spec.durationMs, spec.startDelayMs]);

  const style = useAnimatedStyle(() => {
    const translateX = interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, 8, -12, 6, 0]);
    const translateY = interpolate(t.value, [0, 0.25, 0.5, 0.75, 1], [0, -18, -8, 14, 0]);
    return { transform: [{ translateX }, { translateY }] };
  });

  return (
    <Animated.View
      style={[
        style,
        {
          position: 'absolute',
          backgroundColor: color,
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
  /** Splash's particles sit on the lime background and are dark (#080808, the design's
   *  --app-black); Landing's sit on the near-black background and are lime instead — the same
   *  dark-on-light / light-on-dark pairing as the logo. Defaulting to black preserves Splash's
   *  existing look for every other caller. */
  color?: string;
  /** Defaults match Splash.module.css's own particle (`0.15 + Math.random()*0.15`) — Landing's
   *  are fainter (`0.12 + Math.random()*0.12`), passed explicitly from there. */
  opacityRange?: RandomRange;
  /** Defaults match Splash's `8 + Math.random()*10` seconds — Landing's loop slightly slower
   *  (`9 + Math.random()*10`), passed explicitly from there. */
  durationSecRange?: RandomRange;
}

export const SplashParticles = ({
  count = 14,
  color = '#080808',
  opacityRange = { min: 0.15, max: 0.3 },
  durationSecRange = { min: 8, max: 18 },
}: SplashParticlesProps) => {
  const particles = useMemo(
    () => randomParticles(count, opacityRange, durationSecRange),
    [count, opacityRange.min, opacityRange.max, durationSecRange.min, durationSecRange.max],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Particle key={p.id} spec={p} color={color} />
      ))}
    </View>
  );
};
