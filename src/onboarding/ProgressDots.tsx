import { StyleSheet, View } from "react-native";

interface ProgressDotsProps {
  total: number;
  current: number;
}

export const ProgressDots = ({ total, current }: ProgressDotsProps) => (
  <View style={styles.row}>
    {Array.from({ length: total }, (_, i) => {
      const index = i + 1;
      const isActive = index === current;
      const isDone = index < current;
      return (
        <View
          key={i}
          style={[
            styles.dot,
            isDone && styles.dotDone,
            isActive && styles.dotActive,
          ]}
        />
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dot: {
    height: 2,
    width: 16,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  dotDone: { width: 16, backgroundColor: "rgba(255,255,255,0.35)" },
  dotActive: { width: 28, backgroundColor: "#C8F135" },
});
