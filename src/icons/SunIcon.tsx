import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Sun" icon — see HouseIcon.tsx for why it's vendored.
export const SunIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} />
      <Path d="M12 2v2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 20v2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="m4.93 4.93 1.41 1.41" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="m17.66 17.66 1.41 1.41" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M2 12h2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M20 12h2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="m6.34 17.66-1.41 1.41" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="m19.07 4.93-1.41 1.41" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
};
