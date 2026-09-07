import React, { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface CollapsibleSessionCardProps {
  collapsed: boolean;
  collapsedHeight: number;
  expandedHeight: number;
  backgroundColor: string;
  onPress?: () => void;
  children: React.ReactNode;
}

export function CollapsibleSessionCard({
  collapsed,
  collapsedHeight,
  expandedHeight,
  backgroundColor,
  onPress,
  children,
}: CollapsibleSessionCardProps) {
  const progress = useSharedValue(collapsed ? 0 : 1);

  useEffect(() => {
    progress.value = withTiming(collapsed ? 0 : 1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [collapsed]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: collapsedHeight + (expandedHeight - collapsedHeight) * progress.value,
  }));

  return (
    <Animated.View style={[styles.card, { backgroundColor }, animatedStyle]}>
      {/* Only wrapped in a Pressable when the whole card is the tap target. A card whose states
          have their own controls (an expand row, a collapse header, a scrolling list) passes no
          onPress — a wrapper Pressable there would compete with them for the touch responder. */}
      {onPress ? (
        <Pressable style={styles.pressArea} onPress={onPress}>
          <View style={styles.content}>{children}</View>
        </Pressable>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Inset on all four sides and fully rounded — this is a card floating over the thread, not a
  // sheet welded to the bottom edge. The 24px top margin is deliberate: combined with the
  // thread's own 52px bottom padding it's the full separation the design asks for between chat
  // and card.
  card: {
    marginTop: 24,
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 16,
    overflow: "hidden",
  },
  pressArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
