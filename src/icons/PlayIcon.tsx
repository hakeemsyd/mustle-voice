import React from "react";
import Svg, { Polygon } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "Play" icon — see HouseIcon.tsx for why it's vendored.
export const PlayIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Polygon points="6 3 20 12 6 21 6 3" fill={color} />
    </Svg>
  );
};
