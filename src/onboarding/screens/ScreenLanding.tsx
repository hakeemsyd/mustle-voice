import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SplashParticles } from './SplashParticles';
import { MustleLogoPaths } from '../../icons/MustleLogo';
import { colors, fonts } from '../../constants/theme';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface ScreenLandingProps {
  onGetStarted: () => void;
  onLogIn: () => void;
}

// Landing/Decision — sits between Splash and the rest of onboarding, ported from mustle-mvp's
// ScreenLanding.tsx/.module.css. Values below (sizes, gaps, colors, timings) are taken directly
// from that source rather than approximated, after a prior pass drifted from it in several
// visible ways: the logo's baked-in #141414 fill going invisible against this screen's near-
// black background (the source forces it white via a CSS filter — see MustleLogoPaths' `color`
// prop), particles rendered in the wrong color (black-on-black, invisible — Landing's are lime,
// unlike Splash's), the body laid out with space-between instead of centered-as-one-group (the
// source's own explicit reason: CTAs should sit near the copy, not pinned to the screen edge),
// the subline's wrap width left to flow with screen width instead of the source's fixed 280px
// cap, and the rings/glow rendered static instead of continuously pulsing.
export const ScreenLanding = ({ onGetStarted, onLogIn }: ScreenLandingProps) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(80, withTiming(1, { duration: 300 }));
  }, []);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={styles.screen}>
      <SplashParticles
        count={10}
        color={colors.accent}
        opacityRange={{ min: 0.12, max: 0.24 }}
        durationSecRange={{ min: 9, max: 19 }}
      />

      <Animated.View style={[styles.body, fadeStyle]}>
        <View style={styles.content}>
          <Svg width={116} height={116} viewBox="0 0 1080 1080">
            <MustleLogoPaths color={colors.text} />
          </Svg>

          <OverheadPressIllustration />

          <View style={styles.copy}>
            <Text style={styles.headline}>YOUR COACH IS WAITING.</Text>
            <Text style={styles.subline}>Talk to your coach. Get a plan that actually fits you.</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.btnLime} onPress={onGetStarted}>
            <Text style={styles.btnLimeText}>GET STARTED</Text>
          </Pressable>
          <Pressable onPress={onLogIn} hitSlop={8}>
            <Text style={styles.loginLink}>
              Already have an account? <Text style={styles.loginLinkAccent}>Log In</Text>
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
};

function OverheadPressIllustration() {
  const glow = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);
  const barY = useSharedValue(0);

  useEffect(() => {
    const loop = (duration: number) =>
      withRepeat(withSequence(withTiming(1, { duration }), withTiming(0, { duration })), -1, false);
    glow.value = loop(2000);
    ring1.value = loop(2250);
    ring2.value = withDelay(1100, loop(2700));
    barY.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []);

  // 0 -> 1 -> 0 drives opacity/scale between the design's low/high keyframe values, matching
  // its 0%→50%→100% pulses (landingRingPulse / illusGlowPulse).
  const glowProps = useAnimatedProps(() => ({
    r: 84 * (0.94 + glow.value * 0.11),
    opacity: 0.5 + glow.value * 0.5,
  }));
  const ring1Props = useAnimatedProps(() => ({
    r: 76 * (0.97 + ring1.value * 0.07),
    opacity: 0.4 + ring1.value * 0.6,
  }));
  const ring2Props = useAnimatedProps(() => ({
    r: 88 * (0.97 + ring2.value * 0.07),
    opacity: 0.4 + ring2.value * 0.6,
  }));
  const barGroupProps = useAnimatedProps(() => ({
    transform: [{ translateY: barY.value }],
  }));

  return (
    <View style={styles.illusWrap}>
      <Svg width={160} height={200} viewBox="0 0 160 200">
        <Defs>
          {/* react-native-svg's native gradient rendering doesn't reliably extract the alpha
              channel from an rgba() stopColor — it was rendering as a hard-edged solid disc
              instead of a soft falloff (confirmed live). stopOpacity is the actual SVG-spec
              mechanism for this and renders correctly. */}
          <RadialGradient id="landingGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={colors.accent} stopOpacity={0.32} />
            <Stop offset="70%" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <AnimatedCircle cx={80} cy={118} fill="url(#landingGlow)" animatedProps={glowProps} />
        <AnimatedCircle cx={80} cy={118} stroke="rgba(200,241,53,0.16)" strokeWidth={1} fill="none" animatedProps={ring1Props} />
        <AnimatedCircle cx={80} cy={118} stroke="rgba(200,241,53,0.09)" strokeWidth={1} fill="none" animatedProps={ring2Props} />

        <Circle cx={80} cy={94} r={13} fill="rgba(255,255,255,0.85)" />
        <Rect x={60} y={112} width={40} height={56} rx={16} fill="rgba(255,255,255,0.85)" />
        <Rect x={61} y={164} width={13} height={30} rx={6} fill="rgba(255,255,255,0.85)" />
        <Rect x={86} y={164} width={13} height={30} rx={6} fill="rgba(255,255,255,0.85)" />

        <AnimatedG animatedProps={barGroupProps}>
          <Line x1={66} y1={112} x2={42} y2={66} stroke="rgba(255,255,255,0.85)" strokeWidth={7} strokeLinecap="round" />
          <Line x1={94} y1={112} x2={118} y2={66} stroke="rgba(255,255,255,0.85)" strokeWidth={7} strokeLinecap="round" />
          <Rect x={30} y={54} width={100} height={9} rx={4.5} fill={colors.accent} />
          <Rect x={18} y={44} width={15} height={28} rx={6} fill={colors.accent} />
          <Rect x={127} y={44} width={15} height={28} rx={6} fill={colors.accent} />
        </AnimatedG>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingVertical: 56,
    paddingHorizontal: 24,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 40,
  },
  content: {
    alignItems: 'center',
    gap: 28,
  },
  illusWrap: {
    width: 176,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
    maxWidth: 280,
  },
  headline: {
    fontFamily: fonts.display,
    fontSize: 26,
    letterSpacing: 0.5,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  subline: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  actions: {
    alignItems: 'stretch',
    gap: 16,
  },
  btnLime: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLimeText: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.bg,
  },
  loginLink: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  loginLinkAccent: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
  },
});
