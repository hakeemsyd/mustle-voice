import React from "react";
import Svg, { Circle, Line, Polyline } from "react-native-svg";

interface MaleIconProps {
  size?: number;
  color?: string;
}

export const MaleIcon = ({ size = 40, color = "#FFFFFF" }: MaleIconProps) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Circle
        cx="15"
        cy="25"
        r="9"
        stroke={color}
        strokeWidth="1.8"
        fill="none"
      />

      <Line
        x1="21.5"
        y1="18.5"
        x2="33"
        y2="7"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      <Polyline
        points="25,7 33,7 33,15"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
};
