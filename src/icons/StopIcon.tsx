import React from "react";
import Svg, { Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Square" icon (filled) — see HouseIcon.tsx for why it's vendored.
export const StopIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={2} fill={color} />
    </Svg>
  );
};
