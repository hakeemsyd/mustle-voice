import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "AudioLines" icon — see HouseIcon.tsx for why it's vendored.
export const AudioLinesIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  const bar = (d: string) => (
    <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {bar("M2 10v3")}
      {bar("M6 6v11")}
      {bar("M10 3v18")}
      {bar("M14 8v7")}
      {bar("M18 5v13")}
      {bar("M22 10v3")}
    </Svg>
  );
};
