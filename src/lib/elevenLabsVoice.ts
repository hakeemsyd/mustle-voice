import { File, Paths } from 'expo-file-system';

const API_KEY = process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY;
const VOICE_ID = process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID;

const BASE_URL = 'https://api.elevenlabs.io/v1';

let ttsFileCounter = 0;

// Em/en dashes reliably glitch eleven_turbo_v2_5 (audible stutter/click around the
// dash) even though they render fine on screen — swap them for a comma, which reads
// as the same natural pause without tripping the model up. Only affects what's sent
// to TTS, not the on-screen coach message.
const sanitizeForSpeech = (text: string): string => text.replace(/[—–]/g, ',');

/**
 * Speaks `text` in the Mustle coach voice via ElevenLabs TTS and writes the
 * returned audio to a local cache file. Returns the file:// uri to play.
 */
export const synthesizeSpeech = async (text: string): Promise<string> => {
  if (!API_KEY || !VOICE_ID) {
    throw new Error(
      'Missing EXPO_PUBLIC_ELEVENLABS_API_KEY / EXPO_PUBLIC_ELEVENLABS_VOICE_ID — add them to .env',
    );
  }

  const response = await fetch(`${BASE_URL}/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: sanitizeForSpeech(text),
      model_id: 'eleven_turbo_v2_5',
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ElevenLabs TTS failed (${response.status}): ${detail}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  const file = new File(Paths.cache, `mustle-tts-${Date.now()}-${ttsFileCounter++}.mp3`);
  file.create({ overwrite: true });
  file.write(bytes);

  return file.uri;
};

/**
 * Transcribes a recorded answer via ElevenLabs Scribe STT.
 * `uri` is the file:// uri produced by the onboarding recorder.
 */
export const transcribeRecording = async (uri: string): Promise<string> => {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_ELEVENLABS_API_KEY — add it to .env');
  }

  const formData = new FormData();
  formData.append('model_id', 'scribe_v1');
  // React Native's networking bridge only recognizes this { uri, name, type } shape as a
  // real file blob in multipart bodies — expo-file-system's File (despite `implements Blob`)
  // isn't picked up by RCTNetworking and uploads as an empty part.
  formData.append('file', {
    uri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);

  const response = await fetch(`${BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
    },
    body: formData,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ElevenLabs STT failed (${response.status}): ${detail}`);
  }

  const json = await response.json();
  return (json.text ?? '').trim();
};
