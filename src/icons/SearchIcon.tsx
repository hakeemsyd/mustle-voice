import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Search" icon — see HouseIcon.tsx for why it's vendored.
export const SearchIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="m21 21-4.34-4.34" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="11" cy="11" r="8" stroke={color} strokeWidth={2} />
    </Svg>
  );
};
