import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Path data from lucide's "list" icon — see HouseIcon.tsx for why it's vendored.
export const ListIcon = ({ size = 20, color = "#FFFFFF", strokeWidth = 2 }: Props) => {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 12h.01" {...stroke} />
      <Path d="M3 18h.01" {...stroke} />
      <Path d="M3 6h.01" {...stroke} />
      <Path d="M8 12h13" {...stroke} />
      <Path d="M8 18h13" {...stroke} />
      <Path d="M8 6h13" {...stroke} />
    </Svg>
  );
};
