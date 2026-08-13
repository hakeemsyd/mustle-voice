import { StyleSheet, Text, View } from "react-native";
import { fonts } from "../constants/theme";

interface ProgressDotsProps {
  total: number;
  current: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export const ProgressDots = ({ total, current }: ProgressDotsProps) => {
  const pct = Math.min(100, Math.max(0, (current / total) * 100));

  return (
    <View style={styles.row}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>

      <Text style={styles.label}>
        {pad(current)}
        <Text style={styles.labelTotal}>/{pad(total)}</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  track: {
    flex: 1,
    height: 2,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "#C8F135",
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    letterSpacing: 0.24,
    color: "#FFFFFF",
  },
  labelTotal: {
    fontFamily: fonts.body,
    color: "#888888",
  },
});
