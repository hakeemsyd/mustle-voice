import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";

interface ProgressRingProps {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  trackColor?: string;
  children?: React.ReactNode;
}

export function ProgressRing({ size, strokeWidth, progress, color, trackColor = "rgba(255,255,255,0.08)", children }: ProgressRingProps) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const center = size / 2;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={center} cy={center} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference * clamped} ${circumference}`}
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      {children}
    </View>
  );
}
