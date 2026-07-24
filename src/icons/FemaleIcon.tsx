import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

interface FemaleIconProps {
  size?: number;
  color?: string;
}

export const FemaleIcon = ({
  size = 40,
  color = "#FFFFFF",
}: FemaleIconProps) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle
        cx="20"
        cy="15"
        r="9"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />

      <Line
        x1="20"
        y1="24"
        x2="20"
        y2="35"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <Line
        x1="14"
        y1="30"
        x2="26"
        y2="30"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
};
