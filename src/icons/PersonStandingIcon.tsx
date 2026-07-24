import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "PersonStanding" icon — see HouseIcon.tsx for why it's vendored.
export const PersonStandingIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1} stroke={color} strokeWidth={2} />
      <Path d="m9 20 3-6 3 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m6 8 6 2 6-2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 10v4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};
