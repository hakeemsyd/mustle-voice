import { StyleSheet, Text, View } from "react-native";
import { fonts } from "../constants/theme";

interface ProgressDotsProps {
  total: number;
  current: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

// Ported from mustle-mvp's ProgressDots.tsx — its own header comment notes this went through
// three redesigns (a track+fill bar, then a segmented Stories-style indicator, then a count+
// label) before landing here: just the step count, centered, no bar at all. Our port was still
// on the very first of those three ("track+fill bar"), which the source explicitly moved past.
export const ProgressDots = ({ total, current }: ProgressDotsProps) => {
  return (
    <View style={styles.wrap}>
      <Text style={styles.count}>
        {pad(current)}
        <Text style={styles.countTotal}>/{pad(total)}</Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 0.3,
    color: "#FFFFFF",
  },
  countTotal: {
    fontFamily: fonts.bodyMedium,
    color: "#666666",
  },
});
