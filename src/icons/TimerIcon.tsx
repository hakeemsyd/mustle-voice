import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Timer" icon — see HouseIcon.tsx for why it's vendored.
export const TimerIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="10" x2="14" y1="2" y2="2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" x2="15" y1="14" y2="11" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="12" cy="14" r="8" stroke={color} strokeWidth={2} />
    </Svg>
  );
};
