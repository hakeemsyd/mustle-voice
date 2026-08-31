import { Platform } from 'react-native';
import { NativeModule, requireNativeModule } from 'expo-modules-core';

export interface AudioInterruptionEvent {
  type: 'began' | 'ended';
}

declare class MustleAudioSessionModule extends NativeModule<{
  onInterruption: (event: AudioInterruptionEvent) => void;
}> {}

// iOS-only, matching the app's own platform support — requireNativeModule would throw on a
// platform this was never built for.
const native: MustleAudioSessionModule | null =
  Platform.OS === 'ios' ? requireNativeModule<MustleAudioSessionModule>('MustleAudioSession') : null;

/** Fires whenever iOS interrupts the audio session — an incoming/active phone call, Siri, an
 *  alarm — so a live voice conversation can be ended instead of continuing in the background.
 *  Returns a no-op unsubscribe if the native module isn't present (non-iOS, or a JS bundle
 *  running ahead of a native rebuild that hasn't picked this module up yet). */
export function subscribeToAudioInterruptions(onBegan: () => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onInterruption', (event) => {
    if (event.type === 'began') onBegan();
  });
  return () => sub.remove();
}
