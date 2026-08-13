import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Keyboard" icon — see HouseIcon.tsx for why it's vendored.
export const KeyboardIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  const dot = (x: number, y: number) => (
    <Path d={`M${x} ${y}h.01`} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={2} y={4} width={20} height={16} rx={2} stroke={color} strokeWidth={2} />
      {dot(6, 8)}
      {dot(10, 8)}
      {dot(14, 8)}
      {dot(18, 8)}
      {dot(6, 12)}
      {dot(10, 12)}
      {dot(14, 12)}
      {dot(18, 12)}
      <Path d="M6 16h12" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};
