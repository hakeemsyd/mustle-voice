import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "BedDouble" icon — see HouseIcon.tsx for why it's vendored.
export const BedDoubleIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  const common = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" {...common} />
      <Path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" {...common} />
      <Path d="M12 4v6" {...common} />
      <Path d="M2 18h20" {...common} />
    </Svg>
  );
};
