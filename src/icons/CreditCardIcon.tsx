import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Path data from lucide's "credit-card" icon — see HouseIcon.tsx for why it's vendored.
export const CreditCardIcon = ({ size = 20, color = "#FFFFFF", strokeWidth = 2 }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect width="20" height="14" x="2" y="5" rx="2" stroke={color} strokeWidth={strokeWidth} />
      <Path d="M2 10h20" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};
