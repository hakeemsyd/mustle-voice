import React from "react";
import Svg, { Circle } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Target" icon — see HouseIcon.tsx for why it's vendored.
export const TargetIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="6" stroke={color} strokeWidth={2} />
      <Circle cx="12" cy="12" r="2" stroke={color} strokeWidth={2} />
    </Svg>
  );
};
