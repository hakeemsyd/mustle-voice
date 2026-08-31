import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
}

// Ported from mustle-mvp's AuthGlyphs.tsx (GoogleGlyph) — same 4-tone "G" mark, unchanged path
// data, just as react-native-svg Path elements instead of an inline <svg>.
export const GoogleIcon = ({ size = 18 }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 20 20">
      <Path
        d="M19.6 10.23c0-.68-.06-1.32-.17-1.95H10v3.9h5.38c-.24 1.25-.95 2.31-2.02 3.02v2.5h3.27c1.91-1.76 3.02-4.36 3.02-7.47Z"
        fill="#4285F4"
      />
      <Path
        d="M10 20c2.7 0 4.96-.89 6.62-2.4l-3.27-2.5c-.9.61-2.06.97-3.35.97-2.57 0-4.75-1.74-5.53-4.07H1.1v2.59A9.99 9.99 0 0 0 10 20Z"
        fill="#34A853"
      />
      <Path
        d="M4.47 11.99A5.99 5.99 0 0 1 4.15 10c0-.69.12-1.36.32-1.99V5.42H1.1A10 10 0 0 0 0 10c0 1.61.39 3.14 1.1 4.58l3.37-2.59Z"
        fill="#FBBC05"
      />
      <Path
        d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87C14.95.98 12.7 0 10 0 6.1 0 2.73 2.24 1.1 5.42l3.37 2.59C5.25 5.68 7.43 3.96 10 3.96Z"
        fill="#EA4335"
      />
    </Svg>
  );
};
