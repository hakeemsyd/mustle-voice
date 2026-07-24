import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Calendar" icon — see HouseIcon.tsx for why it's vendored.
export const CalendarIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 2v4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 2v4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={3} y={4} width={18} height={18} rx={2} stroke={color} strokeWidth={2} />
      <Path d="M3 10h18" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};
