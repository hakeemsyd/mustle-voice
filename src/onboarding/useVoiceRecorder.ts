import { useCallback, useEffect, useRef } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';

const METERING_POLL_MS = 100;
const WARMUP_MS = 600;
const SMOOTHING_WINDOW = 4;
const PEAK_DECAY_DB_PER_SEC = 6;
const SILENCE_DROP_DB = 8;
const RESUME_MARGIN_DB = 5;
const SILENCE_DURATION_MS = 1300;
const CONTENT_RANGE_DB = 8;
const MIN_CONTENT_STREAK_MS = 350;
const MIN_RECORDING_MS = 1500;
const MAX_RECORDING_MS = 14000;

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

export type StopReason = 'paused' | 'no-speech' | 'max-length';

interface VadSession {
  startedAt: number | null;
  lastPollAt: number | null;
  onPause: ((reason: StopReason) => void) | null;
  recentSamples: number[];
  peak: number | null;
  quietest: number | null;
  silenceSince: number | null;
  activeStreakStartedAt: number | null;
  hadSustainedContent: boolean;
  pollCount: number;
  warnedNoMetering: boolean;
  fired: boolean;
}

const createSession = (onPause: (reason: StopReason) => void): VadSession => ({
  startedAt: null,
  lastPollAt: null,
  onPause,
  recentSamples: [],
  peak: null,
  quietest: null,
  silenceSince: null,
  activeStreakStartedAt: null,
  hadSustainedContent: false,
  pollCount: 0,
  warnedNoMetering: false,
  fired: false,
});

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export const useVoiceRecorder = () => {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, METERING_POLL_MS);
  const sessionRef = useRef<VadSession | null>(null);

  const start = useCallback(
    async (onUserPaused: (reason: StopReason) => void) => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        throw new Error('Microphone permission not granted');
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(RECORDING_OPTIONS);

      sessionRef.current = createSession(onUserPaused);
      recorder.record();
    },
    [recorder],
  );

  const stop = useCallback(async (): Promise<string | null> => {
    sessionRef.current = null;
    await recorder.stop();
    const uri = recorder.uri;
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    return uri;
  }, [recorder]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || session.fired || !session.onPause || !recorderState.isRecording) return;

    const { metering } = recorderState;
    if (metering === undefined) {
      if (!session.warnedNoMetering) {
        session.warnedNoMetering = true;
        console.warn('[onboarding voice] VAD: no metering — auto-stop disabled, manual tap only');
      }
      return;
    }

    const now = Date.now();
    if (session.startedAt === null) session.startedAt = now;
    const dt = session.lastPollAt === null ? 0 : (now - session.lastPollAt) / 1000;
    session.lastPollAt = now;

    const elapsed = now - session.startedAt;
    if (elapsed < WARMUP_MS) return;

    session.recentSamples.push(metering);
    if (session.recentSamples.length > SMOOTHING_WINDOW) session.recentSamples.shift();
    const smoothed = average(session.recentSamples);

    session.quietest = session.quietest === null ? smoothed : Math.min(session.quietest, smoothed);

    if (session.peak === null) {
      session.peak = smoothed;
    } else if (session.silenceSince === null) {
      session.peak = Math.max(smoothed, session.peak - PEAK_DECAY_DB_PER_SEC * dt);
    }

    const silenceThreshold = session.peak - SILENCE_DROP_DB;
    const resumeThreshold = session.peak - RESUME_MARGIN_DB;

    if (smoothed > resumeThreshold) {
      session.silenceSince = null;
    } else if (smoothed < silenceThreshold) {
      if (session.silenceSince === null) session.silenceSince = now;
    }

    // A single loud transient (a click, a door, a dropped weight) can swing `peak` up
    // instantly, so "above peak - margin" is the wrong reference for detecting real content —
    // peak reacts to the very spike we're trying to filter out. `quietest` only ratchets
    // downward toward the true floor and never spikes, so it's the stable baseline: require
    // the level to sit above it for MIN_CONTENT_STREAK_MS before counting as real content,
    // since real speech sustains energy for hundreds of ms and a click doesn't.
    if (smoothed > session.quietest + CONTENT_RANGE_DB) {
      if (session.activeStreakStartedAt === null) session.activeStreakStartedAt = now;
      if (now - session.activeStreakStartedAt >= MIN_CONTENT_STREAK_MS) session.hadSustainedContent = true;
    } else {
      session.activeStreakStartedAt = null;
    }

    const silenceElapsed = session.silenceSince ? now - session.silenceSince : 0;
    const range = session.peak - session.quietest;
    const sawContent = session.hadSustainedContent;

    session.pollCount += 1;
    // Logging every 100ms poll floods the RN bridge during longer recordings, which can
    // itself delay subsequent timers — throttle to every 5th sample (~500ms) for the running
    // trace; the stop-reason line below always logs regardless.
    if (session.pollCount % 5 === 0) {
      console.log(
        `[onboarding voice] VAD trace: metering=${metering.toFixed(1)} smoothed=${smoothed.toFixed(1)} ` +
          `peak=${session.peak.toFixed(1)} quietest=${session.quietest.toFixed(1)} range=${range.toFixed(1)} ` +
          `sustained=${session.hadSustainedContent} silenceAt=${silenceThreshold.toFixed(1)} resumeAt=${resumeThreshold.toFixed(1)} ` +
          `silenceElapsed=${silenceElapsed} elapsed=${elapsed}`,
      );
    }

    const pausedAfterSpeaking = elapsed > MIN_RECORDING_MS && silenceElapsed > SILENCE_DURATION_MS;
    const timedOut = elapsed > MAX_RECORDING_MS;
    if (!pausedAfterSpeaking && !timedOut) return;

    const reason: StopReason = !sawContent ? 'no-speech' : pausedAfterSpeaking ? 'paused' : 'max-length';
    console.log(
      `[onboarding voice] VAD auto-stop (${reason}) after ${elapsed}ms, range ${range.toFixed(1)} dB`,
    );

    session.fired = true;
    const callback = session.onPause;
    session.onPause = null;
    callback(reason);
  }, [recorderState]);

  return { start, stop };
};
