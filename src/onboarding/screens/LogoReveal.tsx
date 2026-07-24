import { useEffect } from "react";
import Svg, { Circle, Defs, G, Mask } from "react-native-svg";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { MustleLogoPaths } from "../../icons/MustleLogo";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VIEWBOX = 1080;
const CENTER = VIEWBOX / 2;
const FULL_RADIUS = Math.sqrt(2) * CENTER * 1.2;

interface LogoRevealProps {
  size?: number;
  delayMs?: number;
  durationMs?: number;
}

export const LogoReveal = ({
  size = 200,
  delayMs = 200,
  durationMs = 800,
}: LogoRevealProps) => {
  const radius = useSharedValue(0);

  useEffect(() => {
    radius.value = withDelay(
      delayMs,
      withTiming(FULL_RADIUS, {
        duration: durationMs,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [radius, delayMs, durationMs]);

  const animatedProps = useAnimatedProps(() => ({ r: radius.value }));

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}>
      <Defs>
        <Mask id="logoRevealMask">
          <AnimatedCircle
            cx={CENTER}
            cy={CENTER}
            fill="white"
            animatedProps={animatedProps}
          />
        </Mask>
      </Defs>
      <G mask="url(#logoRevealMask)">
        <MustleLogoPaths />
      </G>
    </Svg>
  );
};
