import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

// Reference (mustle-mvp) uses lucide's ChevronLeft at size={22} strokeWidth={2.5} — this
// defaulted to a visibly smaller, thinner 16px/1.5 icon on every screen that uses it (none
// override the default), so bumping it here fixes all of them at once.
export const BackIcon = ({ size = 22, color = "#FFFFFF" }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M10 12L6 8L10 4"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};
