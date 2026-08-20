import Svg, { Circle, Polyline } from "react-native-svg";
import { colors } from "../constants/theme";

const W = 56;
const H = 22;
const PAD = 3;

interface SparklineProps {
  values: number[];
}

export function Sparkline({ values }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;

  const points = values
    .map((v, i) => {
      const x = PAD + (i / (n - 1)) * (W - PAD * 2);
      const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const lastY = H - PAD - ((values[n - 1] - min) / range) * (H - PAD * 2);

  return (
    <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <Polyline
        points={points}
        fill="none"
        stroke={colors.accent}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
      <Circle cx={W - PAD} cy={lastY} r={2.5} fill={colors.accent} />
    </Svg>
  );
}
