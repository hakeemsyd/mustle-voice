import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "TrendingUp" icon — see HouseIcon.tsx for why it's vendored.
export const TrendingUpIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M16 7h6v6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="m22 7-8.5 8.5-5-5L2 17"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
