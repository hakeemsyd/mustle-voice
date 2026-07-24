import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { fonts } from '../constants/theme';

export type OrbState = 'idle' | 'breathing' | 'speaking' | 'listening' | 'processing';

const TINT: Record<OrbState, string> = {
  idle: '#C8F135',
  breathing: '#C8F135',
  speaking: '#C8F135',
  listening: '#5BB8F5',
  processing: '#A78BFA',
};

const AMBIENT_ALPHA: Record<OrbState, number> = { idle: 0, breathing: 0.1, speaking: 0.26, listening: 0.2, processing: 0.18 };
const RING_ALPHA: Record<OrbState, number> = { idle: 0.1, breathing: 0.25, speaking: 0.7, listening: 0.55, processing: 0.6 };
const RING_STROKE: Record<OrbState, string> = {
  idle: 'rgba(200,241,53,0.12)',
  breathing: 'rgba(200,241,53,0.3)',
  speaking: 'rgba(200,241,53,0.5)',
  listening: 'rgba(91,184,245,0.4)',
  processing: 'rgba(167,139,250,0.15)',
};
const CORE_BORDER: Record<OrbState, string> = {
  idle: 'rgba(68,68,64,0.2)',
  breathing: 'rgba(200,241,53,0.18)',
  speaking: 'rgba(200,241,53,0.55)',
  listening: 'rgba(91,184,245,0.5)',
  processing: 'rgba(167,139,250,0.35)',
};
const GLOW_ALPHA: Record<OrbState, number> = { idle: 0, breathing: 0, speaking: 0.8, listening: 0.7, processing: 0.5 };
const BASE: Record<OrbState, [string, string, string]> = {
  idle: ['#111100', '#080800', '#030300'],
  breathing: ['#181800', '#0d0d00', '#050500'],
  speaking: ['#1e2000', '#0f0f00', '#050500'],
  listening: ['#001525', '#000d18', '#000508'],
  processing: ['#0e0015', '#080010', '#030008'],
};

const SPEAK_LAYERS = [
  { r: 0.3, speed: 1, phase: 0, alpha: 0.22 },
  { r: 0.22, speed: 1.3, phase: 1.2, alpha: 0.3 },
  { r: 0.15, speed: 0.9, phase: 2.4, alpha: 0.38 },
  { r: 0.08, speed: 1.6, phase: 0.7, alpha: 0.5 },
];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface OrbProps {
  state: OrbState;
  size?: number;
}

export const Orb = ({ state, size = 172 }: OrbProps) => {
  const outer = size * 1.7;
  const center = outer / 2;
  const coreR = size / 2;
  const ambientR = size * 0.79;
  const ringR = size * 0.558;
  const ring2R = size * 0.628;
  const innerGlowR = size * 0.3;

  const breathe = useSharedValue(0);
  const speakPulse = useSharedValue(0);
  const listenPulse = useSharedValue(0);
  const speakPhase = useSharedValue(0);
  const ringDriverA = useSharedValue(0);
  const ringDriverB = useSharedValue(0);
  const spin = useSharedValue(0);
  const dot1 = useSharedValue(0.15);
  const dot2 = useSharedValue(0.15);
  const dot3 = useSharedValue(0.15);
  const listeningLabel = useSharedValue(0);
  const procPulse = useSharedValue(0);

  useEffect(() => {
    breathe.value =
      state === 'breathing'
        ? withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true)
        : withTiming(0, { duration: 400 });

    speakPulse.value =
      state === 'speaking'
        ? withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true)
        : withTiming(0, { duration: 400 });

    speakPhase.value = state === 'speaking' ? withRepeat(withTiming(40, { duration: 40000, easing: Easing.linear }), -1, false) : 0;

    listenPulse.value =
      state === 'listening'
        ? withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.sin) }), -1, true)
        : withTiming(0, { duration: 400 });

    if (state === 'speaking' || state === 'listening') {
      ringDriverA.value = withRepeat(withTiming(1, { duration: state === 'speaking' ? 1800 : 2000, easing: Easing.out(Easing.ease) }), -1, false);
      ringDriverB.value = withRepeat(withTiming(1, { duration: state === 'speaking' ? 1800 : 2000, easing: Easing.out(Easing.ease) }), -1, false);
    } else {
      ringDriverA.value = 0;
      ringDriverB.value = 0;
    }

    spin.value = state === 'processing' ? withRepeat(withTiming(360, { duration: 1800, easing: Easing.linear }), -1, false) : 0;

    procPulse.value =
      state === 'processing'
        ? withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true)
        : withTiming(0, { duration: 400 });

    if (state === 'processing') {
      const blink = (delay: number) =>
        withDelay(delay, withRepeat(withSequence(withTiming(1, { duration: 500 }), withTiming(0.15, { duration: 800 })), -1, false));
      dot1.value = blink(0);
      dot2.value = blink(220);
      dot3.value = blink(440);
    } else {
      dot1.value = 0.15;
      dot2.value = 0.15;
      dot3.value = 0.15;
    }

    listeningLabel.value = state === 'listening' ? withTiming(1, { duration: 400 }) : withTiming(0, { duration: 200 });
  }, [state, breathe, speakPulse, speakPhase, listenPulse, ringDriverA, ringDriverB, spin, procPulse, dot1, dot2, dot3, listeningLabel]);

  const ambientProps = useAnimatedProps(() => {
    let scale = 1;
    let opacity = state === 'idle' ? 0 : 1;
    if (state === 'breathing') {
      scale = interpolate(breathe.value, [0, 1], [0.93, 1.06]);
      opacity = interpolate(breathe.value, [0, 1], [0.7, 1]);
    } else if (state === 'speaking') {
      scale = interpolate(speakPulse.value, [0, 1], [0.95, 1.08]);
      opacity = interpolate(speakPulse.value, [0, 1], [0.8, 1]);
    } else if (state === 'listening') {
      scale = interpolate(listenPulse.value, [0, 1], [0.97, 1.05]);
      opacity = interpolate(listenPulse.value, [0, 1], [0.8, 1]);
    } else if (state === 'processing') {
      scale = interpolate(procPulse.value, [0, 1], [0.96, 1.04]);
      opacity = interpolate(procPulse.value, [0, 1], [0.7, 1]);
    }
    return { r: ambientR * scale, opacity };
  });

  const coreProps = useAnimatedProps(() => {
    let scale = 1;
    if (state === 'breathing') scale = interpolate(breathe.value, [0, 1], [1, 1.032]);
    else if (state === 'speaking') scale = interpolate(speakPulse.value, [0, 1], [1, 1.028]);
    return { r: coreR * scale };
  });

  const ringProps = useAnimatedProps(() => {
    let r = ringR;
    let opacity = RING_ALPHA[state];
    if (state === 'speaking') {
      r = interpolate(ringDriverA.value, [0, 1], [ringR, ringR * 1.22]);
      opacity = interpolate(ringDriverA.value, [0, 1], [0.7, 0]);
    } else if (state === 'listening') {
      r = interpolate(ringDriverA.value, [0, 1], [ringR * 1.2, ringR]);
      opacity = interpolate(ringDriverA.value, [0, 0.4, 1], [0, 0.55, 0]);
    } else if (state === 'breathing') {
      const s = interpolate(breathe.value, [0, 1], [1, 1.07]);
      r = ringR * s;
      opacity = interpolate(breathe.value, [0, 1], [0.15, 0.35]);
    }
    return { r, opacity, stroke: RING_STROKE[state] };
  });

  const ring2Props = useAnimatedProps(() => {
    let r = ring2R;
    let opacity = 0;
    if (state === 'speaking') {
      r = interpolate(ringDriverB.value, [0, 1], [ring2R, ring2R * 1.22]);
      opacity = interpolate(ringDriverB.value, [0, 1], [0.3, 0]);
    } else if (state === 'listening') {
      r = interpolate(ringDriverB.value, [0, 1], [ring2R * 1.2, ring2R]);
      opacity = interpolate(ringDriverB.value, [0, 0.4, 1], [0, 0.25, 0]);
    } else if (state === 'processing') {
      opacity = 0.3;
    }
    return { r, opacity, stroke: state === 'processing' ? 'rgba(167,139,250,0.1)' : RING_STROKE[state] };
  });

  const spinRingProps = useAnimatedProps(() => {
    const rad = (spin.value * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Rotation matrix about (center, center) — 'rotation'/'origin' props only
    // apply once at mount in react-native-svg, so drive the raw matrix instead.
    return {
      matrix: [cos, sin, -sin, cos, center * (1 - cos) + center * sin, center * (1 - cos) - center * sin] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ],
    };
  });

  const innerGlowProps = useAnimatedProps(() => ({ opacity: GLOW_ALPHA[state] }));

  const listeningLabelStyle = useAnimatedStyle(() => ({ opacity: listeningLabel.value }));
  const dot1Style = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: dot2.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: dot3.value }));

  const tint = TINT[state];
  const base = BASE[state];
  const circumference = 2 * Math.PI * ringR;

  return (
    <View style={{ width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={outer} height={outer}>
        <Defs>
          <RadialGradient id="ambient" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={AMBIENT_ALPHA[state]} />
            <Stop offset="0.5" stopColor={tint} stopOpacity={AMBIENT_ALPHA[state] * 0.4} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="base" cx="50%" cy="48%" r="65%">
            <Stop offset="0" stopColor={base[0]} />
            <Stop offset="0.6" stopColor={base[1]} />
            <Stop offset="1" stopColor={base[2]} />
          </RadialGradient>
          <RadialGradient id="innerGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={0.45} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="spec" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0.08} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          {state === 'speaking' &&
            SPEAK_LAYERS.map((layer) => (
              <RadialGradient key={layer.phase} id={`speak-${layer.phase}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={tint} stopOpacity={1} />
                <Stop offset="0.5" stopColor={tint} stopOpacity={0.4} />
                <Stop offset="1" stopColor={tint} stopOpacity={0} />
              </RadialGradient>
            ))}
        </Defs>

        <AnimatedCircle cx={center} cy={center} fill="url(#ambient)" animatedProps={ambientProps} />

        <AnimatedCircle cx={center} cy={center} fill="none" strokeWidth={1} animatedProps={ringProps} />
        <AnimatedCircle cx={center} cy={center} fill="none" strokeWidth={1} animatedProps={ring2Props} />

        {state === 'processing' && (
          <AnimatedCircle
            cx={center}
            cy={center}
            r={ringR}
            fill="none"
            stroke="rgba(167,139,250,0.8)"
            strokeWidth={1.5}
            strokeDasharray={`${circumference * 0.25} ${circumference * 0.75}`}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            animatedProps={spinRingProps as any}
          />
        )}

        <AnimatedCircle cx={center} cy={center} fill="url(#base)" animatedProps={coreProps} />

        {state === 'speaking' &&
          SPEAK_LAYERS.map((layer) => (
            <SpeakLayer key={layer.phase} center={center} size={size} layer={layer} phase={speakPhase} />
          ))}

        <AnimatedCircle cx={center} cy={center} r={innerGlowR} fill="url(#innerGlow)" animatedProps={innerGlowProps} />

        <Circle cx={center} cy={center} r={coreR} fill="none" stroke={CORE_BORDER[state]} strokeWidth={1} />

        <Ellipse
          cx={center - size * 0.15}
          cy={center - size * 0.15}
          rx={size * 0.19}
          ry={size * 0.13}
          fill="url(#spec)"
        />
      </Svg>

      <View style={[StyleSheet.absoluteFill, styles.overlay]}>
        {state === 'listening' && (
          <Animated.Text style={[styles.listeningLabel, listeningLabelStyle]}>LISTENING</Animated.Text>
        )}
        {state === 'processing' && (
          <View style={styles.dotsRow}>
            <Animated.View style={[styles.dot, dot1Style]} />
            <Animated.View style={[styles.dot, dot2Style]} />
            <Animated.View style={[styles.dot, dot3Style]} />
          </View>
        )}
      </View>
    </View>
  );
};

interface SpeakLayerProps {
  center: number;
  size: number;
  layer: (typeof SPEAK_LAYERS)[number];
  phase: SharedValue<number>;
}

const SpeakLayer = ({ center, size, layer, phase }: SpeakLayerProps) => {
  const props = useAnimatedProps(() => {
    const pulse = 0.5 + 0.5 * Math.sin(phase.value * layer.speed + layer.phase);
    return { r: (layer.r + pulse * 0.06) * size, opacity: layer.alpha * pulse };
  });

  return <AnimatedCircle cx={center} cy={center} fill={`url(#speak-${layer.phase})`} animatedProps={props} />;
};

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', justifyContent: 'center' },
  listeningLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    letterSpacing: 1.2,
    color: 'rgba(91,184,245,0.75)',
  },
  dotsRow: { flexDirection: 'row', gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(167,139,250,0.7)' },
});
