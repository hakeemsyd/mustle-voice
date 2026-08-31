import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Vendored from lucide-react's "mic" icon (mustle-mvp's MicKeyboardVoiceInput.tsx) — matches
// its exact path data, not MaterialIcons' differently-proportioned filled glyph.
export const MicIcon = ({ size = 15, color = "#FFFFFF", strokeWidth = 2 }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 19v3" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M19 10v2a7 7 0 0 1-14 0v-2"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Rect x={9} y={2} width={6} height={13} rx={3} stroke={color} strokeWidth={strokeWidth} />
    </Svg>
  );
};
