// Three different Supabase error codes can fire when linkIdentity() can't proceed because the
// account it would create/attach to already exists — which one depends on whether it's the
// exact same (provider, provider_id) pair being reused (identity_already_exists) or a different
// provider that happens to resolve to an email already owned by another user (email_exists /
// user_already_exists — e.g. linking Apple with the same real email as an already-linked Google
// account). All three mean the same thing to the user: this identity/email already belongs to an
// existing MUSTLE account, most likely an earlier, now-orphaned anonymous session from a prior
// install/rebuild (see the anonymous-identity-instability history in appleAuth.ts/googleAuth.ts's
// callers). Retrying does nothing — it fails identically forever, since the account really does
// already exist. The only real recovery is signing into that existing account instead of linking
// it here, which is what ScreenAccountCreation offers when any of these fire.
const ALREADY_EXISTS_CODES = new Set(['identity_already_exists', 'email_exists', 'user_already_exists']);

export function isIdentityAlreadyLinkedError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return !!code && ALREADY_EXISTS_CODES.has(code);
}
