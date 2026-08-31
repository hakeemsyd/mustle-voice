import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SplashParticles } from './SplashParticles';
import { MustleLogoPaths } from '../../icons/MustleLogo';
import { fonts } from '../../constants/theme';

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const LIME = '#C8F135';
const BLACK = '#080808';

interface SplashProps {
  onComplete: () => void;
}

// Kinetic-type intro, ported from mustle-mvp's Splash.tsx: logo appears, fades, then the
// tagline builds word by word (stacked, each word staying once it lands), then a small
// line-art dumbbell draws itself in on the right, holds, then auto-advances. Timings, sizes,
// and layout match the source design (a single centered stage that swaps its content between
// phases, tagline pinned to the left edge, illustration fixed against the whole screen's right
// edge independent of the tagline) — the stroke-draw-in below approximates each shape's
// perimeter (react-native-svg has no native `pathLength` normalization the web version relies
// on) rather than computing it exactly, close enough for a decorative flourish.
const TAGLINE_WORDS = 'THE ONLY FITNESS APP THAT TALKS BACK'.split(' ');
const LOGO_HOLD_MS = 600;
const LOGO_FADE_MS = 250;
const GAP_MS = 150;
const WORD_MS = 190;
const DRAW_DELAY_MS = 250;
const DRAW_ANIM_MS = 1450;
const DRAW_HOLD_MS = 500;

type IntroPhase = 'logo' | 'logoOut' | 'words' | 'draw';

export const Splash = ({ onComplete }: SplashProps) => {
  const calledRef = useRef(false);
  const [phase, setPhase] = useState<IntroPhase>('logo');
  const [wordIndex, setWordIndex] = useState(0);
  const logoOpacity = useSharedValue(1);
  const screenOpacity = useSharedValue(1);

  const handleAdvance = () => {
    if (calledRef.current) return;
    calledRef.current = true;
    screenOpacity.value = withTiming(0, { duration: 350, easing: Easing.linear });
    setTimeout(onComplete, 350);
  };

  // logo -> logoOut
  useEffect(() => {
    const t = setTimeout(() => setPhase('logoOut'), LOGO_HOLD_MS);
    return () => clearTimeout(t);
  }, []);

  // logoOut -> words, once the fade-out finishes
  useEffect(() => {
    if (phase !== 'logoOut') return;
    logoOpacity.value = withTiming(0, { duration: LOGO_FADE_MS, easing: Easing.linear });
    const t = setTimeout(() => setPhase('words'), LOGO_FADE_MS + GAP_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // words: advance one at a time, then hand off to "draw"
  useEffect(() => {
    if (phase !== 'words') return;
    if (wordIndex >= TAGLINE_WORDS.length) {
      const t = setTimeout(() => setPhase('draw'), DRAW_DELAY_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setWordIndex((i) => i + 1), WORD_MS);
    return () => clearTimeout(t);
  }, [phase, wordIndex]);

  // draw: illustration draws in, holds, then auto-advances
  useEffect(() => {
    if (phase !== 'draw') return;
    const t = setTimeout(handleAdvance, DRAW_ANIM_MS + DRAW_HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleAdvance}>
        <SplashParticles />

        {/* One centered stage shared by both phases — matches the source design's .logoWrap,
            which re-centers around whichever content is currently mounted rather than the two
            phases living in separately-laid-out containers. */}
        <View style={styles.stage}>
          {(phase === 'logo' || phase === 'logoOut') && (
            <Animated.View style={{ opacity: logoOpacity }}>
              <Svg width={200} height={200} viewBox="0 0 1080 1080">
                <MustleLogoPaths />
              </Svg>
            </Animated.View>
          )}

          {(phase === 'words' || phase === 'draw') && (
            <View style={styles.wordStack}>
              {TAGLINE_WORDS.map((w, i) => (
                <RevealWord key={w + i} text={w} revealed={i <= wordIndex} />
              ))}
            </View>
          )}
        </View>

        {/* Positioned against the whole screen, not the word stack — independent of the
            tagline's own centering, same as the source design. */}
        {phase === 'draw' && (
          <View style={styles.illustrationWrap}>
            <DumbbellDrawIn />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
};

// All seven words mount as soon as "words" phase begins (reserving the tagline's full height
// immediately) — only opacity/position animate as `revealed` flips true. Rendering just a
// growing slice of the array instead would make the centered stage keep re-centering itself
// taller with every word, a visible reflow the source design's CSS never has (there, all lines
// exist from the start, just invisible until each one's turn).
function RevealWord({ text, revealed }: { text: string; revealed: boolean }) {
  const progress = useSharedValue(revealed ? 1 : 0);

  useEffect(() => {
    if (revealed) progress.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.ease) });
  }, [revealed]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }],
  }));

  return <Animated.Text style={[styles.stackWord, style]}>{text}</Animated.Text>;
}

// CSS's `ease` keyword is this exact cubic-bezier — matching it (instead of a generic
// Easing.out) so each shape's draw-in accelerates/decelerates the same way the source does.
const CSS_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

function DumbbellDrawIn() {
  // Five independent values, not one shared "progress" — the source design draws each shape on
  // its own delay/duration (module.css's illusDraw animations), so the plates, bar, and motion
  // lines appear one after another like a hand sketching it, not all at once. Driving every
  // shape off a single shared value (confirmed live) made the whole icon appear simultaneously
  // instead.
  const plateLeft = useSharedValue(0);
  const bar = useSharedValue(0);
  const plateRight = useSharedValue(0);
  const motion1 = useSharedValue(0);
  const motion2 = useSharedValue(0);

  useEffect(() => {
    plateLeft.value = withDelay(0, withTiming(1, { duration: 500, easing: CSS_EASE }));
    bar.value = withDelay(380, withTiming(1, { duration: 420, easing: CSS_EASE }));
    plateRight.value = withDelay(700, withTiming(1, { duration: 500, easing: CSS_EASE }));
    motion1.value = withDelay(1080, withTiming(1, { duration: 220, easing: CSS_EASE }));
    motion2.value = withDelay(1160, withTiming(1, { duration: 220, easing: CSS_EASE }));
  }, []);

  // Approximate perimeters (react-native-svg has no native pathLength normalization).
  const platePerimeter = 2 * (34 + 100);
  const barPerimeter = 2 * (80 + 16);
  const motionLength = Math.hypot(10, 10);

  const plateLeftProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - plateLeft.value) * platePerimeter,
  }));
  const barProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - bar.value) * barPerimeter,
  }));
  const plateRightProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - plateRight.value) * platePerimeter,
  }));
  const motion1Props = useAnimatedProps(() => ({
    strokeDashoffset: (1 - motion1.value) * motionLength,
  }));
  const motion2Props = useAnimatedProps(() => ({
    strokeDashoffset: (1 - motion2.value) * motionLength,
  }));

  return (
    <Svg width={140} height={102} viewBox="0 0 220 160">
      <AnimatedRect
        x={20} y={30} width={34} height={100} rx={15}
        stroke={BLACK} strokeWidth={5} fill="none"
        strokeDasharray={`${platePerimeter}, ${platePerimeter}`}
        animatedProps={plateLeftProps}
      />
      <AnimatedRect
        x={70} y={72} width={80} height={16} rx={8}
        stroke={BLACK} strokeWidth={5} fill="none"
        strokeDasharray={`${barPerimeter}, ${barPerimeter}`}
        animatedProps={barProps}
      />
      <AnimatedRect
        x={166} y={30} width={34} height={100} rx={15}
        stroke={BLACK} strokeWidth={5} fill="none"
        strokeDasharray={`${platePerimeter}, ${platePerimeter}`}
        animatedProps={plateRightProps}
      />
      <AnimatedLine
        x1={206} y1={46} x2={216} y2={36}
        stroke={BLACK} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${motionLength}, ${motionLength}`}
        animatedProps={motion1Props}
      />
      <AnimatedLine
        x1={206} y1={114} x2={216} y2={124}
        stroke={BLACK} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${motionLength}, ${motionLength}`}
        animatedProps={motion2Props}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LIME,
  },
  stage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordStack: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    paddingLeft: 22,
    gap: 2,
  },
  stackWord: {
    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 44,
    letterSpacing: 0.5,
    color: BLACK,
  },
  illustrationWrap: {
    position: 'absolute',
    top: '50%',
    right: 22,
    marginTop: -51,
  },
});
