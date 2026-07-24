import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export const BackIcon = ({ size = 16, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M15 8H3"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      <Path
        d="M7 12L3 8L7 4"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
