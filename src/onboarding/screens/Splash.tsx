import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { LogoReveal } from './LogoReveal';
import { SplashParticles } from './SplashParticles';
import { fonts } from '../../constants/theme';

const LIME = '#C8F135';
const BLACK = '#080808';

interface SplashProps {
  onComplete: () => void;
}

export const Splash = ({ onComplete }: SplashProps) => {
  const calledRef = useRef(false);
  const screenOpacity = useSharedValue(1);
  const taglineOpacity = useSharedValue(0);

  useEffect(() => {
    taglineOpacity.value = withDelay(200, withTiming(0.75, { duration: 800, easing: Easing.out(Easing.cubic) }));

    const fadeTimer = setTimeout(() => {
      screenOpacity.value = withTiming(0, { duration: 400, easing: Easing.linear });
    }, 2200);

    const advanceTimer = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onComplete();
      }
    }, 2600);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(advanceTimer);
    };
  }, [onComplete, taglineOpacity, screenOpacity]);

  return (
    <Animated.View style={[styles.root, { opacity: screenOpacity }]}>
      <SplashParticles />
      <Animated.View style={styles.logoWrap}>
        <LogoReveal size={200} />
        <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>
          THE ONLY FITNESS APP THAT TALKS BACK.
        </Animated.Text>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LIME,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    alignItems: 'center',
    gap: 16,
    marginTop: -80,
  },
  tagline: {
    fontFamily: fonts.display,
    fontSize: 15,
    letterSpacing: 0.6,
    color: BLACK,
    textAlign: 'center',
    marginTop: 8,
  },
});
