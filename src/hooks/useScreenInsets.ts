import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ScreenInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Safe-area insets that survive a `fullScreenModal` presentation.
 *
 * Screens presented that way are hosted in their own native view controller, and the root
 * SafeAreaProvider's measurement does not reach them — `useSafeAreaInsets()` comes back all
 * zeroes and headers draw underneath the status bar. `initialWindowMetrics` is captured from
 * the window at launch and stays correct there, so take whichever value is larger.
 */
export function useScreenInsets(): ScreenInsets {
  const live = useSafeAreaInsets();
  const atLaunch = initialWindowMetrics?.insets;

  return {
    top: Math.max(live.top, atLaunch?.top ?? 0),
    bottom: Math.max(live.bottom, atLaunch?.bottom ?? 0),
    left: Math.max(live.left, atLaunch?.left ?? 0),
    right: Math.max(live.right, atLaunch?.right ?? 0),
  };
}
