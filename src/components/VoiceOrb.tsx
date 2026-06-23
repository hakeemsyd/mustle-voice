import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ACCENT } from '../constants/theme';
import type { AppStatus } from '../types';

interface VoiceOrbProps {
  status: AppStatus;
  onPress: () => void;
}

export function VoiceOrb({ status, onPress }: VoiceOrbProps) {
  const pulseAnim  = useRef(new Animated.Value(1)).current;
  const orbOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    pulseAnim.setValue(1.0);
    orbOpacity.setValue(1.0);

    if (status === 'recording') {
      // Steady in-out pulse — mic is live
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.22, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();

    } else if (status === 'transcribing') {
      // Fast blink — audio is being processed
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(orbOpacity, { toValue: 0.15, duration: 180, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 0.85, duration: 180, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();

    } else if (status === 'thinking') {
      // Very slow dim breathing — Claude is generating
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(orbOpacity, { toValue: 0.08, duration: 1400, useNativeDriver: true }),
          Animated.timing(orbOpacity, { toValue: 0.45, duration: 1400, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();

    } else if (status === 'streaming') {
      // Quick scale tick — tokens arriving
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.07, duration: 350, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 350, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();

    } else if (status === 'speaking') {
      // Gentle swell — coach is talking
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 900, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,  duration: 900, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();

    } else {
      Animated.parallel([
        Animated.timing(pulseAnim,  { toValue: 1.0, duration: 200, useNativeDriver: true }),
        Animated.timing(orbOpacity, { toValue: 1.0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [status]);

  const isBusy = status === 'transcribing' || status === 'thinking' || status === 'streaming';

  return (
    <View style={styles.overlay}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }], opacity: orbOpacity }}>
        <TouchableOpacity
          style={[styles.orb, isBusy && styles.orbBusy]}
          onPress={onPress}
          activeOpacity={0.85}
        >
          <View style={[styles.dot, status === 'recording' && styles.dotActive]} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  orb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 36,
    elevation: 12,
  },
  orbBusy: { backgroundColor: '#1e1e1e', shadowOpacity: 0 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#0a0a0a' },
  dotActive: { borderRadius: 3 },
});
