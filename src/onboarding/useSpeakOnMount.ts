import { useEffect, useState } from "react";
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { synthesizeSpeech } from "../lib/elevenLabsVoice";

const PLAYBACK_RETRIES = 2;
const PLAYBACK_RETRY_DELAY_MS = 350;

/**
 * Speaks `text` in the coach voice as soon as the calling component mounts.
 * Returns `audioDone` (true once playback finishes, or immediately if disabled/failed)
 * so callers can gate a phase transition on the audio actually finishing, and
 * `audioStarted` (true once playback has actually begun, or immediately if
 * disabled/failed) so callers can hold off starting anything meant to track the
 * voice — like a word-by-word reveal — until there's actually audio to track.
 * The TTS network round-trip can take 1-3s, so anything gated on mount alone
 * runs well ahead of the voice.
 */
export const useSpeakOnMount = (text: string, enabled: boolean = true) => {
  const [audioDone, setAudioDone] = useState(!enabled);
  const [audioStarted, setAudioStarted] = useState(!enabled);
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      try {
        const uri = await synthesizeSpeech(text);

        for (let attempt = 0; ; attempt++) {
          if (cancelled) return;
          try {
            await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
            player.replace({ uri });
            player.play();
            return;
          } catch (err) {
            if (attempt >= PLAYBACK_RETRIES) throw err;
            console.warn("[onboarding voice] playback start failed, retrying:", err);
            await new Promise((resolve) => setTimeout(resolve, PLAYBACK_RETRY_DELAY_MS));
          }
        }
      } catch (err) {
        console.error("[onboarding voice] TTS failed:", err);
        if (!cancelled) {
          setAudioDone(true);
          setAudioStarted(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status.playing && !audioStarted) {
      setAudioStarted(true);
    }
  }, [status.playing, audioStarted]);

  // Temporary: logs playback-quality signals (buffering stalls, unexpected state
  // changes) so a reported audio glitch can be matched to a concrete cause instead
  // of guessed at. Remove once the "flickering voice" report is diagnosed.
  useEffect(() => {
    console.log(
      `[onboarding voice] player status: playing=${status.playing} isBuffering=${status.isBuffering} ` +
        `playbackState=${status.playbackState} timeControlStatus=${status.timeControlStatus} ` +
        `reasonForWaitingToPlay=${status.reasonForWaitingToPlay} currentTime=${status.currentTime.toFixed(2)}`,
    );
  }, [status.playing, status.isBuffering, status.playbackState, status.timeControlStatus]);

  useEffect(() => {
    if (status.didJustFinish) {
      setAudioDone(true);
    }
  }, [status.didJustFinish]);

  return { audioDone, audioStarted };
};
