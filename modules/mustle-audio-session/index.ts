import { Platform } from 'react-native';
import { NativeModule, requireNativeModule } from 'expo-modules-core';

export interface AudioInterruptionEvent {
  type: 'began' | 'ended';
}

declare class MustleAudioSessionModule extends NativeModule<{
  onInterruption: (event: AudioInterruptionEvent) => void;
}> {
  releaseWebrtcAudio(): Promise<{ before: string; after: string; notes?: string }>;
  enableWebrtcAudio(): Promise<{ before: string; after: string }>;
  reassertSessionActive(): Promise<string>;
  getInputFormat(): Promise<{ sampleRate: number; inputChannels: number }>;
  describeAudioSessionState(): Promise<string>;
}

// iOS-only, matching the app's own platform support — requireNativeModule would throw on a
// platform this was never built for.
const native: MustleAudioSessionModule | null =
  Platform.OS === 'ios' ? requireNativeModule<MustleAudioSessionModule>('MustleAudioSession') : null;

/** Fires whenever iOS interrupts the audio session — an incoming/active phone call, Siri, an
 *  alarm — so a live voice conversation can be ended instead of continuing in the background,
 *  and picked back up once the interruption is over. `onEnded` matters as much as `onBegan`:
 *  without it the call stays closed after the phone call that displaced it, and since nothing
 *  else re-opens the mic mid-workout, the coach goes permanently deaf for the rest of the session.
 *  Returns a no-op unsubscribe if the native module isn't present (non-iOS, or a JS bundle
 *  running ahead of a native rebuild that hasn't picked this module up yet). */
export function subscribeToAudioInterruptions(onBegan: () => void, onEnded?: () => void): () => void {
  if (!native) return () => {};
  const sub = native.addListener('onInterruption', (event) => {
    if (event.type === 'began') onBegan();
    else onEnded?.();
  });
  return () => sub.remove();
}

export async function releaseWebrtcAudio(): Promise<void> {
  if (!native || typeof native.releaseWebrtcAudio !== 'function') {
    console.warn('[MustleAudioSession] releaseWebrtcAudio not available on this binary — needs a native rebuild');
    return;
  }
  await native.releaseWebrtcAudio();
}

export async function enableWebrtcAudio(): Promise<void> {
  if (!native || typeof native.enableWebrtcAudio !== 'function') {
    console.warn('[MustleAudioSession] enableWebrtcAudio not available on this binary — needs a native rebuild');
    return;
  }
  await native.enableWebrtcAudio();
}

/** The sample rate the hardware is running at now — a recording configured for a different rate
 *  captures digital silence, so it has to be read per take. */
export async function getInputSampleRate(): Promise<number | null> {
  if (!native || typeof native.getInputFormat !== 'function') return null;
  const { sampleRate } = await native.getInputFormat();
  return sampleRate > 0 ? sampleRate : null;
}

/** Undoes a stray session deactivation landing on a live recording. Safe to call while recording. */
export async function reassertSessionActive(): Promise<void> {
  if (!native || typeof native.reassertSessionActive !== 'function') return;
  const result = await native.reassertSessionActive();
  if (result !== 'ok') console.warn(`[MustleAudioSession] reassert session active: ${result}`);
}

export async function logAudioSessionState(label: string): Promise<void> {
  if (!native || typeof native.describeAudioSessionState !== 'function') {
    console.warn(`[MustleAudioSession] ${label}: describeAudioSessionState not available on this binary`);
    return;
  }
  const state = await native.describeAudioSessionState().catch((err) => `<error: ${err}>`);
  console.log(`[MustleAudioSession] ${label}: ${state}`);
}
