import React from "react";
import Svg, { Circle, Path } from "react-native-svg";

interface CheckIconProps {
  size?: number;
  color?: string;
}

export const CheckIcon = ({ size = 18, color = "#C8F135" }: CheckIconProps) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Circle
        cx="8"
        cy="8"
        r="7"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />

      <Path
        d="M4.5 8L7 10.5L11.5 5.5"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
