import { supabase } from './supabase';

const BUCKET = 'chat-attachments';
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

// Owner-scoped path: the bucket's RLS policies key off the first path segment being the
// caller's own user id, so this prefix is what makes an upload readable by its owner and
// nobody else.
function attachmentPath(userId: string, suffix: string): string {
  return `${userId}/${Date.now()}-${suffix}`;
}

/** Uploads a local image URI and returns a signed URL the brain can fetch it from. Shared by
 *  every chat surface that can attach a photo — the upload/sign dance is identical everywhere,
 *  and a second copy of it drifts the moment the bucket or TTL changes. */
export async function uploadChatImage(userId: string, uri: string): Promise<string> {
  const path = attachmentPath(userId, `${Math.random().toString(36).slice(2)}.jpg`);
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg' });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SEC);
  if (signError || !signed?.signedUrl) throw new Error(signError?.message ?? 'failed to sign attachment url');

  return signed.signedUrl;
}

/** Uploads a picked document. No signed URL is returned: document vision isn't wired on the
 *  backend, so the file is stored and the coach is only told its name. */
export async function uploadChatFile(userId: string, uri: string, name: string): Promise<void> {
  const path = attachmentPath(userId, name.replace(/[^a-zA-Z0-9_.-]/g, '_'));
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob);
  if (uploadError) throw new Error(uploadError.message);
}
