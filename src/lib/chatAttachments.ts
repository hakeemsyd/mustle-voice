import { File } from 'expo-file-system';
import { supabase } from './supabase';

const BUCKET = 'chat-attachments';

// Two different lifetimes, previously conflated into one week-long URL.
//
// The model's copy only has to survive the round trip: Anthropic fetches the image while the
// request is in flight, so minutes are generous. The one the app renders has to work forever —
// but "forever" is achieved by minting a fresh short-lived URL each time history loads, NOT by
// issuing a long-lived one. What gets persisted on the message row is the storage PATH.
//
// Storing the signed URL instead meant every photo in chat silently died after seven days, with
// the dead link baked into the row. It also meant anyone who obtained that link had a week of
// unauthenticated access to a physique photo, RLS bypassed.
const MODEL_FETCH_TTL_SEC = 60 * 10;
const RENDER_TTL_SEC = 60 * 60;

// Owner-scoped path: the bucket's RLS policies key off the first path segment being the
// caller's own user id, so this prefix is what makes an upload readable by its owner and
// nobody else.
function attachmentPath(userId: string, suffix: string): string {
  return `${userId}/${Date.now()}-${suffix}`;
}

export interface UploadedAttachment {
  /** Owner-scoped storage path — this is what gets persisted, so it never expires. */
  path: string;
  /** Short-lived URL for the model's own fetch, never stored. */
  signedUrl: string;
}

/** Uploads a local image URI. Returns the storage path to persist and a short-lived signed URL
 *  for the brain's fetch. Shared by every chat surface that can attach a photo — the upload/sign
 *  dance is identical everywhere, and a second copy of it drifts the moment the bucket changes. */
export async function uploadChatImage(userId: string, uri: string): Promise<UploadedAttachment> {
  const path = attachmentPath(userId, `${Math.random().toString(36).slice(2)}.jpg`);
  // Not fetch(uri).blob() — RN's networking bridge doesn't upload a fetch-polyfilled Blob's real
  // bytes (same class of bug already found and fixed for the onboarding recorder's STT upload,
  // see elevenLabsVoice.ts's transcribeRecording comment). expo-file-system's File.bytes() reads
  // the real file content directly as a Uint8Array, which Supabase Storage's upload() accepts
  // natively — no Blob/fetch layer in between to silently drop the payload.
  const bytes = await new File(uri).bytes();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, MODEL_FETCH_TTL_SEC);
  if (signError || !signed?.signedUrl) throw new Error(signError?.message ?? 'failed to sign attachment url');

  return { path, signedUrl: signed.signedUrl };
}

/**
 * Pulls the storage path back out of a previously-persisted absolute URL.
 *
 * Rows written before this change hold a full signed URL, and the path is right there inside it
 * (".../object/sign/chat-attachments/<path>?token=..."), so those photos are recoverable rather
 * than written off — nothing already uploaded is lost.
 */
function pathFromLegacyUrl(ref: string): string | null {
  const marker = `/${BUCKET}/`;
  const at = ref.indexOf(marker);
  if (at === -1) return null;
  const tail = ref.slice(at + marker.length).split('?')[0];
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

/**
 * Turns whatever is stored on a message row into something renderable right now.
 *
 * Accepts storage paths (what we persist today), absolute URLs from before this change, and the
 * local file:// URI an optimistic bubble carries before its upload finishes. Signs in ONE batched
 * call for the whole screen rather than per image. A ref that fails to sign is dropped rather
 * than returned broken — the caller renders no thumbnail instead of a permanent grey box.
 */
export async function resolveAttachmentUrls(refs: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>();
  const pathByRef = new Map<string, string>();

  for (const ref of refs) {
    if (!ref) continue;
    if (ref.startsWith('file://') || ref.startsWith('data:')) {
      resolved.set(ref, ref);
      continue;
    }
    const path = ref.startsWith('http') ? pathFromLegacyUrl(ref) : ref;
    if (path) pathByRef.set(ref, path);
    else resolved.set(ref, ref);
  }

  const paths = [...new Set(pathByRef.values())];
  if (paths.length === 0) return resolved;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, RENDER_TTL_SEC);
  if (error) {
    console.error('[chatAttachments] failed to sign attachments:', error.message);
    return resolved;
  }
  const urlByPath = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) urlByPath.set(row.path, row.signedUrl);
  }
  for (const [ref, path] of pathByRef) {
    const url = urlByPath.get(path);
    if (url) resolved.set(ref, url);
  }
  return resolved;
}

/** Uploads a picked document. No signed URL is returned: document vision isn't wired on the
 *  backend, so the file is stored and the coach is only told its name. */
export async function uploadChatFile(userId: string, uri: string, name: string): Promise<void> {
  const path = attachmentPath(userId, name.replace(/[^a-zA-Z0-9_.-]/g, '_'));
  const bytes = await new File(uri).bytes();

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes);
  if (uploadError) throw new Error(uploadError.message);
}
