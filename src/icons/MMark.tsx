import Svg, { Path } from 'react-native-svg';

interface MMarkProps {
  size?: number;
  color?: string;
}

// The Mustle "M" glyph, isolated from mustle-logo.svg's full lockup (glyph + "MUSTLE"
// wordmark) — same two paths as MustleLogoPaths' second <G>, just cropped to the glyph's own
// bbox (+8px padding) instead of the full 1080x1080 canvas, so it doesn't inherit the wordmark.
const ASPECT = 272 / 206;

export const MMark = ({ size = 20, color = '#141414' }: MMarkProps) => {
  const width = size * ASPECT;
  return (
    <Svg width={width} height={size} viewBox="404 362 272 206">
      <Path
        fill={color}
        d="M666.72,426.43c-13.48,25.03-34.66,46.62-50.05,60.32l-.17.15v72.55h51.15v-132.78l-.94-.24Z"
      />
      <Path
        fill={color}
        d="M655.87,399.73c.02-.05.04-.11.05-.17.17-.52.33-1.03.48-1.53,2.82-9.96-1.96-20.7-11.5-24.72-3-1.26-5.92-1.62-9.48-1.62-10.73,0-19.78,4.37-7.77,16.38,0,0-25.83-5.45-13.68,14.19,0,0-14.02-1.86-13.51,6.08.42,6.69,7.57,9.43,9.81,10.12.28.09.34.44.12.62-5.06,4.01-44.17,34.69-67.52,41.95l6.76-9.46s-7.69-24.04-30.98-32.97c-4.32-1.66-9.17-2.8-14.62-3.17,0,0,3.41-2.78,11.08-.82,1.37.34,2.7.84,3.99,1.42l.13.06s.67-4.61.67-6.99c0-20.1-16.29-36.39-36.39-36.39-21.98.56-26.43,15.65-26.43,15.65,0,0-.17-3.29,1.92-7.43-10.31,1.47-23.26-5.53-28.63-8.8-1.72-1.05-3.68-1.61-5.7-1.61-6.82,0-12.35,5.53-12.35,12.36v175.09h50.15v-117.47l80.41,70.04c2.28,1.99,5.62,2.18,8.12.46,5.96-4.1,17.51-12.26,30.4-22.34,0,0,14.55-10.15,31.09-26.22,16.54-16.07,35.07-38.08,43.06-61.8.11-.3.2-.6.3-.89Z"
      />
    </Svg>
  );
};
