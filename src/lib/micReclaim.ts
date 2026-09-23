import { releaseWebrtcAudio } from '../../modules/mustle-audio-session';

/** Hands the microphone back from WebRTC before expo-audio tries to record with it.
 *
 *  Deliberately unconditional — it used to be gated on a "has WebRTC run in this JS runtime"
 *  flag, but the state it undoes is native and outlives the JS bundle: after a Metro reload (or
 *  any remount that resets module state) the flag read false while the audio unit was still
 *  holding the input, and every recording came back as digital silence (a flat -120dB VAD trace).
 *  The native call is idempotent and costs a millisecond, so there's nothing to gate. */
export const reclaimMicrophone = async (): Promise<void> => {
  await releaseWebrtcAudio();
};
