import React from "react";
import Svg, { Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Pause" icon — see HouseIcon.tsx for why it's vendored.
export const PauseIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={14} y={4} width={4} height={16} rx={1} fill={color} />
      <Rect x={6} y={4} width={4} height={16} rx={1} fill={color} />
    </Svg>
  );
};
