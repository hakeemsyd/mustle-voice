import { useCallback, useMemo, useRef } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors, fonts } from "../constants/theme";

interface WheelPickerProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  itemHeight?: number;
  visibleCount?: number;
  formatLabel?: (n: number) => string;
  accessibilityLabel?: string;
}

const DEFAULT_ITEM_HEIGHT = 52;
const DEFAULT_VISIBLE_COUNT = 7;

// iOS UIPickerView-style wheel — ported from mustle-mvp's WheelPicker.tsx (web, CSS scroll-snap).
// RN doesn't need that version's JS "settle" debounce: onMomentumScrollEnd/onScrollEndDrag already
// fire exactly once the scroll has actually stopped, so those are the direct native equivalent of
// "wait for the gesture to finish, then commit."
export function WheelPicker({
  min,
  max,
  value,
  onChange,
  itemHeight = DEFAULT_ITEM_HEIGHT,
  visibleCount = DEFAULT_VISIBLE_COUNT,
  formatLabel = (n) => String(n),
  accessibilityLabel,
}: WheelPickerProps) {
  const values = useMemo(
    () => Array.from({ length: max - min + 1 }, (_, i) => min + i),
    [min, max],
  );
  const padCount = Math.floor(visibleCount / 2);
  const viewportHeight = itemHeight * visibleCount;

  const scrollRef = useRef<Animated.ScrollView>(null);
  const scrollY = useSharedValue((value - min) * itemHeight);
  const lastCommitted = useRef(value);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const commitFromOffset = useCallback(
    (offsetY: number) => {
      const index = Math.round(offsetY / itemHeight);
      const clamped = Math.min(Math.max(index, 0), values.length - 1);
      const next = min + clamped;
      if (next !== lastCommitted.current) {
        lastCommitted.current = next;
        onChange(next);
      }
    },
    [itemHeight, values.length, min, onChange],
  );

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) =>
      commitFromOffset(e.nativeEvent.contentOffset.y),
    [commitFromOffset],
  );

  const handleTapItem = (n: number) => {
    scrollRef.current?.scrollTo({ y: (n - min) * itemHeight, animated: true });
    lastCommitted.current = n;
    onChange(n);
  };

  return (
    <View style={[styles.wrap, { height: viewportHeight }]}>
      <View
        pointerEvents="none"
        style={[
          styles.centerBand,
          { height: itemHeight, top: itemHeight * padCount },
        ]}
      />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingTop: itemHeight * padCount,
          paddingBottom: itemHeight * padCount,
        }}
        onScroll={scrollHandler}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={handleMomentumEnd}
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: (value - min) * itemHeight }}
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
      >
        {values.map((n) => (
          <WheelItem
            key={n}
            n={n}
            index={n - min}
            itemHeight={itemHeight}
            padCount={padCount}
            viewportHeight={viewportHeight}
            scrollY={scrollY}
            label={formatLabel(n)}
            onPress={() => handleTapItem(n)}
          />
        ))}
      </Animated.ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[colors.bg, "transparent"]}
        style={[styles.edgeFade, styles.edgeFadeTop, { height: viewportHeight * 0.28 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", colors.bg]}
        style={[styles.edgeFade, styles.edgeFadeBottom, { height: viewportHeight * 0.28 }]}
      />
    </View>
  );
}

interface WheelItemProps {
  n: number;
  index: number;
  itemHeight: number;
  padCount: number;
  viewportHeight: number;
  scrollY: SharedValue<number>;
  label: string;
  onPress: () => void;
}

function WheelItem({
  n,
  index,
  itemHeight,
  padCount,
  viewportHeight,
  scrollY,
  label,
  onPress,
}: WheelItemProps) {
  const centerY = itemHeight * padCount + index * itemHeight + itemHeight / 2;

  const animatedStyle = useAnimatedStyle(() => {
    const viewportCenter = scrollY.value + viewportHeight / 2;
    const dist = Math.abs(centerY - viewportCenter) / itemHeight;
    // Matches the source's exact falloff (`Math.max(1 - dist*0.45, 0.15)` / `...*0.22, 0.62`),
    // not a linear interpolation over the full visible range — the source decays roughly twice
    // as fast and hits its floor by ~dist 1.9, so rows more than ~2 away from center are
    // already fully dim instead of still visibly fading in.
    const opacity = Math.max(1 - dist * 0.45, 0.15);
    const scale = Math.max(1 - dist * 0.22, 0.62);
    // Hard cutoff, not a gradient — matches the source's `isSelected = dist < 0.5`:
    // only the one item actually sitting in the center band is brand-color, everything
    // else is plain white (at whatever opacity its distance gives it).
    const color = dist < 0.5 ? colors.accent : colors.text;
    return {
      opacity,
      color,
      transform: [{ scale }],
    };
  });

  return (
    <Pressable
      onPress={onPress}
      style={{
        height: itemHeight,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Animated.Text style={[styles.itemText, animatedStyle]}>
        {label}
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    maxWidth: 180,
    alignSelf: "center",
    position: "relative",
  },
  centerBand: {
    position: "absolute",
    left: 6,
    right: 6,
    borderWidth: 1,
    borderColor: "rgba(200,241,53,0.25)",
    backgroundColor: "rgba(200,241,53,0.06)",
    borderRadius: 12,
    zIndex: 0,
  },
  itemText: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 36,
    letterSpacing: 0.3,
  },
  edgeFade: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 1,
  },
  edgeFadeTop: {
    top: 0,
  },
  edgeFadeBottom: {
    bottom: 0,
  },
});
