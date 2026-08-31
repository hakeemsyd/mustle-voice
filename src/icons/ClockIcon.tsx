import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Path data from lucide's "Clock" icon — see HouseIcon.tsx for why it's vendored.
export const ClockIcon = ({ size = 20, color = "#FFFFFF", strokeWidth = 2 }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} stroke={color} strokeWidth={strokeWidth} />
      <Path d="M12 6v6l4 2" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};
