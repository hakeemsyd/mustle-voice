import React from "react";
import Svg, { Line } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "SlidersHorizontal" icon — see HouseIcon.tsx for why it's vendored.
export const SlidersIcon = ({ size = 18, color = "#FFFFFF" }: Props) => {
  const stroke = { stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="21" y1="6" x2="10" y2="6" {...stroke} />
      <Line x1="6" y1="6" x2="3" y2="6" {...stroke} />
      <Line x1="21" y1="12" x2="14" y2="12" {...stroke} />
      <Line x1="10" y1="12" x2="3" y2="12" {...stroke} />
      <Line x1="21" y1="18" x2="18" y2="18" {...stroke} />
      <Line x1="14" y1="18" x2="3" y2="18" {...stroke} />
      <Line x1="8" y1="4" x2="8" y2="8" {...stroke} />
      <Line x1="12" y1="10" x2="12" y2="14" {...stroke} />
      <Line x1="16" y1="16" x2="16" y2="20" {...stroke} />
    </Svg>
  );
};
