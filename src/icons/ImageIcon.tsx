import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Path data from lucide's "Image" icon — see HouseIcon.tsx for why it's vendored.
export const ImageIcon = ({ size = 20, color = "#FFFFFF", strokeWidth = 2 }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={9} cy={9} r={2} stroke={color} strokeWidth={strokeWidth} />
      <Path
        d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
