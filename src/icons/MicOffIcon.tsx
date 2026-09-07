import React from "react";
import Svg, { Line, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "MicOff" icon — see HouseIcon.tsx for why it's vendored.
export const MicOffIcon = ({ size = 18, color = "#FFFFFF" }: Props) => {
  const stroke = { stroke: color, strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Line x1="2" y1="2" x2="22" y2="22" {...stroke} />
      <Path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" {...stroke} />
      <Path d="M5 10v2a7 7 0 0 0 12 5" {...stroke} />
      <Path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" {...stroke} />
      <Path d="M9 9v3a3 3 0 0 0 5.12 2.12" {...stroke} />
      <Line x1="12" y1="19" x2="12" y2="22" {...stroke} />
    </Svg>
  );
};
