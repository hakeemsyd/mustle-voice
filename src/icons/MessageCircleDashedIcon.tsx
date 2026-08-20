import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Path data from lucide's "MessageCircleDashed" icon — see HouseIcon.tsx for why it's vendored.
export const MessageCircleDashedIcon = ({ size = 20, color = "#FFFFFF" }: Props) => {
  const common = { stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M10.1 2.182a10 10 0 0 1 3.8 0" {...common} />
      <Path d="M13.9 21.818a10 10 0 0 1-3.8 0" {...common} />
      <Path d="M17.609 3.72a10 10 0 0 1 2.69 2.7" {...common} />
      <Path d="M2.182 13.9a10 10 0 0 1 0-3.8" {...common} />
      <Path d="M20.28 17.61a10 10 0 0 1-2.7 2.69" {...common} />
      <Path d="M21.818 10.1a10 10 0 0 1 0 3.8" {...common} />
      <Path d="M3.721 6.391a10 10 0 0 1 2.7-2.69" {...common} />
      <Path d="m6.163 21.117-2.906.85a1 1 0 0 1-1.236-1.169l.965-2.98" {...common} />
    </Svg>
  );
};
