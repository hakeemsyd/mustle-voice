import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, FeGaussianBlur, Filter, RadialGradient, Stop } from 'react-native-svg';
import { colors, orbColors } from '../constants/theme';

export type OrbState = 'idle' | 'breathing' | 'speaking' | 'listening' | 'processing';

const TINT: Record<OrbState, string> = {
  idle: 'rgba(200,241,53,0.12)',
  breathing: colors.accent,
  speaking: orbColors.speaking,
  listening: orbColors.listening,
  processing: orbColors.processing,
};

const CORE_BORDER: Record<OrbState, string> = {
  idle: 'rgba(68,68,64,0.2)',
  breathing: 'rgba(200,241,53,0.18)',
  speaking: 'rgba(200,241,53,0.6)',
  listening: 'rgba(91,184,245,0.5)',
  processing: 'rgba(167,139,250,0.35)',
};

interface CoreHighlight {
  cx: number;
  cy: number;
  r: number;
  color: string;
  opacity: number;
}

const CORE_BASE: Record<OrbState, { darkStops: AmbientStop[]; highlight?: CoreHighlight }> = {
  idle: {
    darkStops: [
      { offset: '0%', color: '#111100', opacity: 1 },
      { offset: '60%', color: '#080800', opacity: 1 },
      { offset: '100%', color: '#030300', opacity: 1 },
    ],
  },
  breathing: {
    darkStops: [
      { offset: '0%', color: '#181800', opacity: 1 },
      { offset: '50%', color: '#0d0d00', opacity: 1 },
      { offset: '100%', color: '#050500', opacity: 1 },
    ],
    highlight: { cx: 32, cy: 30, r: 45, color: 'rgb(180,240,60)', opacity: 0.1 },
  },
  speaking: {
    darkStops: [
      { offset: '0%', color: '#1a1c00', opacity: 1 },
      { offset: '50%', color: '#0d0e00', opacity: 1 },
      { offset: '100%', color: '#050500', opacity: 1 },
    ],
    highlight: { cx: 30, cy: 28, r: 50, color: colors.accent, opacity: 0.16 },
  },
  listening: {
    darkStops: [
      { offset: '0%', color: '#001525', opacity: 1 },
      { offset: '50%', color: '#000d18', opacity: 1 },
      { offset: '100%', color: '#000508', opacity: 1 },
    ],
    highlight: { cx: 35, cy: 32, r: 50, color: orbColors.listening, opacity: 0.18 },
  },
  processing: {
    darkStops: [
      { offset: '0%', color: '#0e0015', opacity: 1 },
      { offset: '50%', color: '#080010', opacity: 1 },
      { offset: '100%', color: '#030008', opacity: 1 },
    ],
    highlight: { cx: 30, cy: 30, r: 50, color: orbColors.processing, opacity: 0.14 },
  },
};

const INNER_GLOW: Record<OrbState, { elementOpacity: number; color: string; stopAlpha: number }> = {
  idle: { elementOpacity: 0, color: colors.accent, stopAlpha: 0.35 },
  breathing: { elementOpacity: 0, color: colors.accent, stopAlpha: 0.35 },
  speaking: { elementOpacity: 0.75, color: colors.accent, stopAlpha: 0.4 },
  listening: { elementOpacity: 0.7, color: orbColors.listening, stopAlpha: 0.45 },
  processing: { elementOpacity: 0.5, color: orbColors.processing, stopAlpha: 0.4 },
};

const AMBIENT: Record<OrbState, { dur: number; sMin: number; sMax: number; oMin: number; oMax: number }> = {
  idle: { dur: 3200, sMin: 1, sMax: 1, oMin: 0, oMax: 0 },
  breathing: { dur: 3200, sMin: 0.93, sMax: 1.06, oMin: 0.7, oMax: 1 },
  speaking: { dur: 900, sMin: 0.94, sMax: 1.1, oMin: 0.75, oMax: 1 },
  listening: { dur: 850, sMin: 0.97, sMax: 1.05, oMin: 0.8, oMax: 1 },
  processing: { dur: 2000, sMin: 0.96, sMax: 1.04, oMin: 0.7, oMax: 1 },
};

interface AmbientStop {
  offset: string;
  color: string;
  opacity: number;
}

const AMBIENT_GRADIENT: Record<OrbState, AmbientStop[]> = {
  idle: [{ offset: '0%', color: colors.accent, opacity: 0 }],
  breathing: [
    { offset: '0%', color: colors.accent, opacity: 0.1 },
    { offset: '70%', color: colors.accent, opacity: 0 },
  ],
  speaking: [
    { offset: '0%', color: colors.accent, opacity: 0.22 },
    { offset: '50%', color: 'rgb(160,220,30)', opacity: 0.06 },
    { offset: '70%', color: colors.accent, opacity: 0 },
  ],
  listening: [
    { offset: '0%', color: orbColors.listening, opacity: 0.2 },
    { offset: '68%', color: orbColors.listening, opacity: 0 },
  ],
  processing: [
    { offset: '0%', color: orbColors.processing, opacity: 0.18 },
    { offset: '65%', color: orbColors.processing, opacity: 0 },
  ],
};

const RING1_DELTA = 20;
const RING2_DELTA = 44;
const RING3_DELTA = 76;
const AMBIENT_DELTA = 220;
const AMBIENT_BLUR_STD = 12;
const AMBIENT_BLUR_PAD = 16;
const INNER_GLOW_BLUR_STD = 7;
const INNER_GLOW_BLUR_PAD = 24;

export function VoiceOrb({ state = 'breathing', size = 172 }: { state?: OrbState; size?: number }) {
  const ambScale = useSharedValue(1);
  const ambOpacity = useSharedValue(0.8);
  const coreScale = useSharedValue(1);
  const breatheRingScale = useSharedValue(1);
  const breatheRingOpacity = useSharedValue(0.15);
  const ripple1 = useSharedValue(0);
  const ripple2 = useSharedValue(0);
  const ripple3 = useSharedValue(0);
  const listenRing1 = useSharedValue(0);
  const listenRing2 = useSharedValue(0);
  const spin1 = useSharedValue(0);
  const spin2 = useSharedValue(0);
  const dot = useSharedValue(0);

  useEffect(() => {
    const a = AMBIENT[state];
    ambScale.value = withRepeat(
      withSequence(
        withTiming(a.sMax, { duration: a.dur / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(a.sMin, { duration: a.dur / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    ambOpacity.value = withRepeat(
      withSequence(
        withTiming(a.oMax, { duration: a.dur / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(a.oMin, { duration: a.dur / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );

    if (state === 'breathing') {
      breatheRingScale.value = withRepeat(
        withSequence(
          withTiming(1.07, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
      breatheRingOpacity.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.15, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(breatheRingScale);
      cancelAnimation(breatheRingOpacity);
      breatheRingScale.value = 1;
      breatheRingOpacity.value = 0.15;
    }

    if (state === 'speaking') {
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.032, { duration: 450, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 450, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      );
      ripple1.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }), -1);
      ripple2.value = withDelay(400, withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }), -1));
      ripple3.value = withDelay(800, withRepeat(withTiming(1, { duration: 1200, easing: Easing.out(Easing.ease) }), -1));
    } else {
      cancelAnimation(coreScale);
      coreScale.value = 1;
      cancelAnimation(ripple1);
      cancelAnimation(ripple2);
      cancelAnimation(ripple3);
      ripple1.value = 0;
      ripple2.value = 0;
      ripple3.value = 0;
    }

    if (state === 'listening') {
      listenRing1.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1);
      listenRing2.value = withDelay(550, withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }), -1));
    } else {
      cancelAnimation(listenRing1);
      cancelAnimation(listenRing2);
      listenRing1.value = 0;
      listenRing2.value = 0;
    }

    if (state === 'processing') {
      spin1.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1);
      spin2.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.linear }), -1, true);
      dot.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(spin1);
      spin1.value = 0;
      cancelAnimation(spin2);
      spin2.value = 0;
      cancelAnimation(dot);
      dot.value = 0;
    }

    return () => {
      cancelAnimation(ambScale);
      cancelAnimation(ambOpacity);
      cancelAnimation(coreScale);
      cancelAnimation(breatheRingScale);
      cancelAnimation(breatheRingOpacity);
      cancelAnimation(ripple1);
      cancelAnimation(ripple2);
      cancelAnimation(ripple3);
      cancelAnimation(listenRing1);
      cancelAnimation(listenRing2);
      cancelAnimation(spin1);
      cancelAnimation(spin2);
      cancelAnimation(dot);
    };
  }, [state]);

  const tint = TINT[state];
  const core = size;
  const ring1Size = size + RING1_DELTA;
  const ring2Size = size + RING2_DELTA;
  const ring3Size = size + RING3_DELTA;
  const ambientSize = size + AMBIENT_DELTA;
  const ambientCanvasSize = ambientSize + AMBIENT_BLUR_PAD * 2;

  const centered = (childSize: number) => (core - childSize) / 2;

  const ambientStyle = useAnimatedStyle(() => ({
    opacity: ambOpacity.value,
    transform: [{ scale: ambScale.value }],
  }));

  const coreWrapStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
  }));

  const breatheRingStyle = useAnimatedStyle(() => ({
    opacity: breatheRingOpacity.value,
    transform: [{ scale: breatheRingScale.value }],
  }));

  const ripple1Style = useAnimatedStyle(() => ({
    opacity: (1 - ripple1.value) * 0.8,
    transform: [{ scale: 1 + ripple1.value * 0.65 }],
  }));
  const ripple2Style = useAnimatedStyle(() => ({
    opacity: (1 - ripple2.value) * 0.55,
    transform: [{ scale: 1 + ripple2.value * 0.65 }],
  }));
  const ripple3Style = useAnimatedStyle(() => ({
    opacity: (1 - ripple3.value) * 0.35,
    transform: [{ scale: 1 + ripple3.value * 0.65 }],
  }));

  function useListenRingStyle(t: typeof listenRing1) {
    return useAnimatedStyle(() => {
      const p = t.value;
      const opacity = p < 0.4 ? (p / 0.4) * 0.55 : 0.55 * (1 - (p - 0.4) / 0.6);
      return { opacity, transform: [{ scale: 1.2 - p * 0.2 }] };
    });
  }
  const listenRing1Style = useListenRingStyle(listenRing1);
  const listenRing2Style = useListenRingStyle(listenRing2);

  const spin1Style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin1.value * 360}deg` }] }));
  const spin2Style = useAnimatedStyle(() => ({ transform: [{ rotate: `-${spin2.value * 360}deg` }] }));

  function useDotStyle(phaseOffset: number) {
    return useAnimatedStyle(() => {
      const p = (dot.value + phaseOffset) % 1;
      const eased = p < 0.4 ? p / 0.4 : p < 0.8 ? 1 - (p - 0.4) / 0.4 : 0;
      return { opacity: 0.15 + eased * 0.85, transform: [{ scale: 0.75 + eased * 0.25 }] };
    });
  }
  const dot1Style = useDotStyle(0);
  const dot2Style = useDotStyle(0.17);
  const dot3Style = useDotStyle(0.34);

  return (
    <View style={[styles.wrap, { width: core, height: core }]}>
      <Animated.View
        style={[
          styles.absolute,
          {
            width: ambientCanvasSize,
            height: ambientCanvasSize,
            top: centered(ambientCanvasSize),
            left: centered(ambientCanvasSize),
          },
          ambientStyle,
        ]}
        pointerEvents="none"
      >
        <Svg width={ambientCanvasSize} height={ambientCanvasSize}>
          <Defs>
            <RadialGradient id="ambientGlow" cx="50%" cy="50%" r="71%">
              {AMBIENT_GRADIENT[state].map((stop) => (
                <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
              ))}
            </RadialGradient>
            <Filter id="ambientBlur" x="-50%" y="-50%" width="200%" height="200%">
              <FeGaussianBlur stdDeviation={AMBIENT_BLUR_STD} />
            </Filter>
          </Defs>
          <Circle
            cx={ambientCanvasSize / 2}
            cy={ambientCanvasSize / 2}
            r={ambientSize / 2}
            fill="url(#ambientGlow)"
            filter="url(#ambientBlur)"
          />
        </Svg>
      </Animated.View>

      {state === 'idle' && (
        <View
          style={[
            styles.ring,
            {
              width: ring1Size,
              height: ring1Size,
              borderRadius: ring1Size / 2,
              borderColor: 'rgba(200,241,53,0.12)',
              opacity: 0.1,
              top: centered(ring1Size),
              left: centered(ring1Size),
            },
          ]}
        />
      )}

      {state === 'breathing' && (
        <Animated.View
          style={[
            styles.ring,
            {
              width: ring1Size,
              height: ring1Size,
              borderRadius: ring1Size / 2,
              borderColor: 'rgba(200,241,53,0.3)',
              top: centered(ring1Size),
              left: centered(ring1Size),
            },
            breatheRingStyle,
          ]}
        />
      )}

      {state === 'speaking' && (
        <>
          <Animated.View
            style={[
              styles.ring,
              {
                width: ring1Size,
                height: ring1Size,
                borderRadius: ring1Size / 2,
                borderColor: tint,
                top: centered(ring1Size),
                left: centered(ring1Size),
              },
              ripple1Style,
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: ring2Size,
                height: ring2Size,
                borderRadius: ring2Size / 2,
                borderColor: tint,
                top: centered(ring2Size),
                left: centered(ring2Size),
              },
              ripple2Style,
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: ring3Size,
                height: ring3Size,
                borderRadius: ring3Size / 2,
                borderColor: tint,
                top: centered(ring3Size),
                left: centered(ring3Size),
              },
              ripple3Style,
            ]}
          />
        </>
      )}

      {state === 'listening' && (
        <>
          <Animated.View
            style={[
              styles.ring,
              {
                width: ring1Size,
                height: ring1Size,
                borderRadius: ring1Size / 2,
                borderColor: tint,
                top: centered(ring1Size),
                left: centered(ring1Size),
              },
              listenRing1Style,
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                width: ring2Size,
                height: ring2Size,
                borderRadius: ring2Size / 2,
                borderColor: tint,
                top: centered(ring2Size),
                left: centered(ring2Size),
              },
              listenRing2Style,
            ]}
          />
        </>
      )}

      {state === 'processing' && (
        <>
          <Animated.View
            style={[
              styles.spinnerRing,
              {
                width: ring1Size,
                height: ring1Size,
                borderRadius: ring1Size / 2,
                borderColor: 'rgba(167,139,250,0.15)',
                borderTopColor: tint,
                top: centered(ring1Size),
                left: centered(ring1Size),
              },
              spin1Style,
            ]}
          />
          <Animated.View
            style={[
              styles.spinnerRing,
              {
                width: ring2Size,
                height: ring2Size,
                borderRadius: ring2Size / 2,
                borderColor: 'rgba(167,139,250,0.1)',
                borderBottomColor: tint,
                top: centered(ring2Size),
                left: centered(ring2Size),
              },
              spin2Style,
            ]}
          />
        </>
      )}

      <Animated.View style={coreWrapStyle}>
        <View style={[styles.core, { width: core, height: core, borderRadius: core / 2, borderColor: CORE_BORDER[state] }]}>
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg width={core} height={core}>
              <Defs>
                <RadialGradient id="coreDark" cx="50%" cy="50%" r="71%">
                  {CORE_BASE[state].darkStops.map((stop) => (
                    <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
                  ))}
                </RadialGradient>
                {CORE_BASE[state].highlight && (
                  <RadialGradient
                    id="coreHighlight"
                    cx={`${CORE_BASE[state].highlight!.cx}%`}
                    cy={`${CORE_BASE[state].highlight!.cy}%`}
                    r={`${CORE_BASE[state].highlight!.r}%`}
                  >
                    <Stop
                      offset="0%"
                      stopColor={CORE_BASE[state].highlight!.color}
                      stopOpacity={CORE_BASE[state].highlight!.opacity}
                    />
                    <Stop offset="100%" stopColor={CORE_BASE[state].highlight!.color} stopOpacity={0} />
                  </RadialGradient>
                )}
                <RadialGradient id="innerGlow" cx="32%" cy="30%" r="55%">
                  <Stop offset="0%" stopColor={INNER_GLOW[state].color} stopOpacity={INNER_GLOW[state].stopAlpha} />
                  <Stop offset="100%" stopColor={INNER_GLOW[state].color} stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="specHighlight" cx="50%" cy="50%" r="71%">
                  <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.08} />
                  <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={core / 2} cy={core / 2} r={core / 2} fill="url(#coreDark)" />
              {CORE_BASE[state].highlight && (
                <Circle cx={core / 2} cy={core / 2} r={core / 2} fill="url(#coreHighlight)" />
              )}
              <Circle
                cx={core / 2}
                cy={core / 2}
                r={core / 2}
                fill="url(#innerGlow)"
                opacity={INNER_GLOW[state].elementOpacity}
              />
              <Ellipse cx={core * 0.35} cy={core * 0.24} rx={core * 0.19} ry={core * 0.13} fill="url(#specHighlight)" />
            </Svg>
          </View>

          {state === 'processing' && (
            <View style={styles.dots}>
              <Animated.View style={[styles.dot, { backgroundColor: tint }, dot1Style]} />
              <Animated.View style={[styles.dot, { backgroundColor: tint }, dot2Style]} />
              <Animated.View style={[styles.dot, { backgroundColor: tint }, dot3Style]} />
            </View>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  absolute: { position: 'absolute' },
  ring: { position: 'absolute', borderWidth: 1 },
  spinnerRing: { position: 'absolute', borderWidth: 1.5 },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
