import { StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import { colors } from "../constants/theme";

const VIEW_W = 300;
const VIEW_H = 100;
const PAD_X = 6;
const PAD_TOP = 14;
const PAD_BOTTOM = 20;

interface SvgLineChartProps {
  values: number[];
  color?: string;
  height?: number;
  /** One label per value, drawn along the x-axis (e.g. weekday initials). */
  labels?: string[];
  /** Draws a dashed reference line at the values' average, labeled "AVG n". */
  showAverage?: boolean;
}

export function SvgLineChart({ values, color = colors.accent, height = 120, labels, showAverage }: SvgLineChartProps) {
  if (values.length < 2) {
    return <View style={[styles.empty, { height }]} />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;

  const toXY = (v: number, i: number) => ({
    x: PAD_X + (i / (n - 1)) * (VIEW_W - PAD_X * 2),
    y: PAD_TOP + plotH - ((v - min) / range) * plotH,
  });

  const points = values.map((v, i) => {
    const { x, y } = toXY(v, i);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const average = values.reduce((sum, v) => sum + v, 0) / n;
  const avgY = PAD_TOP + plotH - ((average - min) / range) * plotH;

  return (
    <View style={{ height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}>
        {showAverage && (
          <>
            <Line x1={PAD_X} y1={avgY} x2={VIEW_W - PAD_X} y2={avgY} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
            <SvgText x={VIEW_W - PAD_X} y={avgY - 4} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.35)">
              AVG {Math.round(average)}
            </SvgText>
          </>
        )}
        <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {values.map((v, i) => {
          const { x, y } = toXY(v, i);
          const isLast = i === n - 1;
          return <Circle key={i} cx={x} cy={y} r={isLast ? 4.5 : 3} fill={isLast ? color : "rgba(255,255,255,0.35)"} />;
        })}
        {labels?.map((label, i) => {
          const { x } = toXY(values[i], i);
          return (
            <SvgText key={i} x={x} y={VIEW_H - 6} textAnchor="middle" fontSize={10} fill="rgba(255,255,255,0.3)">
              {label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { backgroundColor: colors.surfaceDeep, borderRadius: 12 },
});
