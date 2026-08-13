import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';

import { transcribeRecording } from '../lib/elevenLabsVoice';

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: false };

export type DictationState = 'idle' | 'recording' | 'transcribing';

// Composer dictation — deliberately NOT the onboarding recorder. That one runs a VAD
// loop and stops itself when it hears a pause; here the user decides when they're done
// by tapping ✓, so a long pause mid-thought must not cut them off.
export const useDictation = (onText: (text: string) => void) => {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const [state, setState] = useState<DictationState>('idle');
  const [seconds, setSeconds] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state !== 'recording') {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
      return;
    }
    tick.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
      tick.current = null;
    };
  }, [state]);

  const start = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        console.warn('[dictation] microphone permission denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);
      setSeconds(0);
      recorder.record();
      setState('recording');
    } catch (error) {
      console.error('[dictation] failed to start:', error);
      setState('idle');
    }
  }, [recorder]);

  const teardown = useCallback(async (): Promise<string | null> => {
    await recorder.stop();
    const uri = recorder.uri;
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    return uri;
  }, [recorder]);

  const cancel = useCallback(async () => {
    setState('idle');
    setSeconds(0);
    try {
      await teardown();
    } catch (error) {
      console.error('[dictation] failed to cancel:', error);
    }
  }, [teardown]);

  const confirm = useCallback(async () => {
    setState('transcribing');
    try {
      const uri = await teardown();
      if (!uri) {
        setState('idle');
        return;
      }
      const text = await transcribeRecording(uri);
      if (text.trim()) onText(text.trim());
    } catch (error) {
      console.error('[dictation] failed to transcribe:', error);
    } finally {
      setState('idle');
      setSeconds(0);
    }
  }, [teardown, onText]);

  return { state, seconds, start, cancel, confirm };
};
