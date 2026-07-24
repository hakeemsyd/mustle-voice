import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

interface PreferNotToSayIconProps {
  size?: number;
  color?: string;
}

export const PreferNotToSayIcon = ({
  size = 40,
  color = "#FFFFFF",
}: PreferNotToSayIconProps) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle
        cx="20"
        cy="20"
        r="11"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />

      <Line
        x1="20"
        y1="14"
        x2="20"
        y2="22"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <Circle cx="20" cy="26.5" r="1.2" fill={color} />
    </Svg>
  );
};
