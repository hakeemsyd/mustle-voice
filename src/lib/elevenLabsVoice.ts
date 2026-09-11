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

// scribe_v1 sometimes transcribes background noise as a bracketed non-speech annotation
// (e.g. "[clicking]", "(background noise)") instead of returning empty — strip those out so
// they never get used as real answer text, and treat what's left as no answer if nothing
// alphabetic survives.
//
// It also sometimes hands back the same kind of placeholder unbracketed — a bare "Silence."
// with no brackets at all, which the regex above has nothing to strip and which then reads as
// real speech (confirmed live: the agent said the word "silence" back to the user). Caught here
// by treating the whole utterance as empty when, once cleaned, it's nothing but one of these
// known placeholders — real speech that happens to mention "silence" mid-sentence is untouched
// since this only matches the *entire* cleaned utterance, not a substring.
const NON_SPEECH_PLACEHOLDER_WORDS = new Set([
  'silence',
  'background noise',
  'noise',
  'inaudible',
  'static',
  'no speech detected',
]);

export const stripNonSpeechArtifacts = (text: string): string => {
  const cleaned = text.replace(/[[(][^\])]*[\])]/g, '').replace(/\s+/g, ' ').trim();
  if (!/[a-zA-Z]/.test(cleaned)) return '';
  const bare = cleaned.toLowerCase().replace(/[.!?,]+$/, '').trim();
  if (NON_SPEECH_PLACEHOLDER_WORDS.has(bare)) return '';
  return cleaned;
};

const fetchSpeechAudio = async (text: string): Promise<string> => {
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

// Onboarding's coach prompts are known well before the screen that speaks them actually
// mounts (most are static strings; the one that isn't is knowable the moment the answer it
// depends on is captured) — caching by exact text lets a prefetch started early and the real
// call at mount time share one in-flight request instead of both hitting the network.
const ttsCache = new Map<string, Promise<string>>();

/**
 * Speaks `text` in the Mustle coach voice via ElevenLabs TTS and writes the
 * returned audio to a local cache file. Returns the file:// uri to play.
 * Reuses an in-flight or already-resolved request for the exact same text.
 */
export const synthesizeSpeech = (text: string): Promise<string> => {
  const cached = ttsCache.get(text);
  if (cached) return cached;

  const request = fetchSpeechAudio(text).catch((err) => {
    // A failed prefetch shouldn't poison the real call later — let it retry fresh.
    ttsCache.delete(text);
    throw err;
  });
  ttsCache.set(text, request);
  return request;
};

/** Fire-and-forget: warms the cache for a prompt that hasn't been spoken yet. */
export const prefetchSpeech = (text: string): void => {
  synthesizeSpeech(text).catch(() => {});
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
  return stripNonSpeechArtifacts((json.text ?? '').trim());
};
