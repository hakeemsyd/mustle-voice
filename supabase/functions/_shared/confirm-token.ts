// Hardens the preview/confirm pattern every mutating tool already uses (log_workout,
// start_todays_workout, reschedule_today, update_food, delete_food). The `confirm: true` flag
// alone only ever meant "the model believes the user agreed" — nothing stopped it calling a tool
// with confirm:true on its very first turn, skipping the preview round-trip entirely, if it
// misheard speech as agreement or misremembered an earlier exchange as having been confirmed.
// Confirmed live (Damion, build 1.0): a misheard partial statement made the model call
// start_todays_workout with confirm:true directly, opening a real session with no preview shown.
//
// A token closes that gap structurally rather than relying on the model's self-report: the
// preview call returns a short-lived signature over the tool name and the exact values that must
// not have drifted (a session id, the precise fields being changed). The confirm call must echo
// that token back verbatim. The model cannot fabricate a valid one — it can only have it by
// having genuinely made the immediately-preceding preview call in this same tool round-trip —
// and a token computed over stale or different values simply won't verify.
const TOKEN_TTL_MS = 5 * 60 * 1000;

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `key` should encode every value the confirm call must reproduce exactly — e.g. a session id,
 *  or a stable hash of the exact proposed fields — so a token silently stops matching the moment
 *  either side has drifted. */
export async function issueConfirmToken(secret: string, tool: string, key: string): Promise<string> {
  const expiry = Date.now() + TOKEN_TTL_MS;
  const sig = await hmac(secret, `${tool}:${key}:${expiry}`);
  return `${expiry}.${sig}`;
}

export async function verifyConfirmToken(
  secret: string,
  tool: string,
  key: string,
  token: unknown,
): Promise<boolean> {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [expiryStr, sig] = token.split('.');
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
  const expected = await hmac(secret, `${tool}:${key}:${expiry}`);
  return expected === sig;
}
