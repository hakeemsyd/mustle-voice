import { useCallback, useEffect, useRef } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { reclaimMicrophone } from '../lib/micReclaim';
import { getInputSampleRate, reassertSessionActive } from '../../modules/mustle-audio-session';

const METERING_POLL_MS = 100;
const WARMUP_MS = 150;
const SMOOTHING_WINDOW = 4;
const PEAK_DECAY_DB_PER_SEC = 6;
// Slow enough that a genuinely loud, constant room floor (a fan, gym noise) can't converge
// `quietest` with `peak` inside a single ~14s take — a real device log in exactly that
// environment showed `range` collapsing to 0 by ~5s in, after which nothing ever reads as
// "quiet" again and every recording runs to the hard cutoff. Still recovers from a single
// anomalous dip (a breath, a mic dropout), just over a longer window than 4dB/sec allowed.
const QUIETEST_RECOVERY_DB_PER_SEC = 1;
const SILENCE_DROP_DB = 8;
const RESUME_MARGIN_DB = 5;
const SILENCE_DURATION_MS = 1300;
const CONTENT_RANGE_DB = 8;
const MIN_CONTENT_STREAK_MS = 350;
const MIN_RECORDING_MS = 1500;
const MAX_RECORDING_MS = 14000;
const SILENT_FLOOR_DB = -119;
const NO_SIGNAL_AFTER_MS = 2500;

const RECORDING_OPTIONS = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

// Match the live hardware rate; a mismatched rate records digital silence with no visible error.
const recordingOptionsForHardware = (sampleRate: number | null) =>
  sampleRate ? { ...RECORDING_OPTIONS, sampleRate, numberOfChannels: 1 } : RECORDING_OPTIONS;

export type StopReason = 'paused' | 'no-speech' | 'max-length' | 'no-signal';

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
  const retriedDeadInputRef = useRef(false);

  const openTake = useCallback(
    async (onPause: (reason: StopReason) => void) => {
      await reclaimMicrophone().catch((err) =>
        console.warn('[onboarding voice] audio session reset failed:', err),
      );

      // 'doNotMix' so the recording claims the input; expo-audio's 'mixWithOthers' default
      // makes it defer to WebRTC's still-resident audio unit and capture nothing.
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
      });

      const sampleRate = await getInputSampleRate().catch(() => null);
      await recorder.prepareToRecordAsync(recordingOptionsForHardware(sampleRate));

      const take = createSession(onPause);
      sessionRef.current = take;
      recorder.record();

      // Any player that just finished has a session deactivation queued behind it; re-assert past
      // that window so it can't land on this take.
      setTimeout(() => {
        if (sessionRef.current !== take) return;
        reassertSessionActive().catch(() => undefined);
      }, 250);
    },
    [recorder],
  );

  const start = useCallback(
    async (onUserPaused: (reason: StopReason) => void) => {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        throw new Error('Microphone permission not granted');
      }

      retriedDeadInputRef.current = false;

      // Reclaim and retry once before reporting a dead input: expo-audio reports the recorder as
      // recording whether or not it captured anything, so metering at the floor is the only signal.
      const handleStop = (reason: StopReason) => {
        const firedTake = sessionRef.current;
        if (reason !== 'no-signal' || retriedDeadInputRef.current || !firedTake) {
          onUserPaused(reason);
          return;
        }
        retriedDeadInputRef.current = true;
        console.warn('[onboarding voice] dead input — reclaiming the audio session and retrying');
        Promise.resolve(recorder.stop())
          .catch(() => undefined)
          .then(() => {
            // The caller may have stopped the recorder itself (a mic tap, leaving the screen)
            // while this was in flight — reopening then would record behind their back.
            if (sessionRef.current !== firedTake) return;
            return openTake(handleStop);
          })
          .catch((err) => {
            console.error('[onboarding voice] retry after dead input failed:', err);
            onUserPaused('no-signal');
          });
      };

      await openTake(handleStop);
    },
    [recorder, openTake],
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

    // `quietest` tracks new lows instantly but also drifts back up toward the current level —
    // otherwise one anomalously quiet moment (a breath, a brief mic dropout) permanently pins
    // the floor too low for the rest of the take, making ordinary ambient noise later on look
    // like sustained content.
    session.quietest =
      session.quietest === null
        ? smoothed
        : Math.min(smoothed, session.quietest + QUIETEST_RECOVERY_DB_PER_SEC * dt);

    if (session.peak === null) {
      session.peak = smoothed;
    } else if (session.silenceSince === null) {
      // Once real speech has actually been confirmed (hadSustainedContent), the peak must never
      // erode back down — silence afterward has to be measured against how loud they actually
      // got. Letting it keep decaying here was the bug: a real device log showed a ~2s answer's
      // peak decay all the way down to meet the ambient floor within ~2.3s of the user going
      // quiet (peak -30.7dB → ambient -39dB, at 6dB/sec), which erases the exact gap this
      // function needs to ever detect "quiet now" — with nothing left to drop below, it never
      // fires and just runs to MAX_RECORDING_MS every time regardless of how fast someone
      // actually finished talking. Decaying (rather than freezing) is still correct BEFORE any
      // content is confirmed, so an early ambient blip doesn't permanently peg the threshold too
      // high for genuinely quiet speech that follows.
      session.peak = session.hadSustainedContent
        ? Math.max(smoothed, session.peak)
        : Math.max(smoothed, session.peak - PEAK_DECAY_DB_PER_SEC * dt);
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
    const noSignal = elapsed > NO_SIGNAL_AFTER_MS && !sawContent && smoothed <= SILENT_FLOOR_DB;
    if (!pausedAfterSpeaking && !timedOut && !noSignal) return;

    const reason: StopReason = noSignal
      ? 'no-signal'
      : timedOut
        ? 'max-length'
        : sawContent
          ? 'paused'
          : 'no-speech';
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
