import React from "react";
import Svg, { Circle } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "MoreHorizontal" icon — see HouseIcon.tsx for why it's vendored.
export const MoreHorizontalIcon = ({ size = 16, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="5" cy="12" r="1.6" fill={color} />
      <Circle cx="12" cy="12" r="1.6" fill={color} />
      <Circle cx="19" cy="12" r="1.6" fill={color} />
    </Svg>
  );
};
