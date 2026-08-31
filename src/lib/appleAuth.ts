import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export class AppleSignInCancelledError extends Error {}

const getAppleCredential = async (): Promise<{ identityToken: string; rawNonce: string }> => {
  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) throw new Error('Sign in with Apple is not available on this device.');

  // Apple requires a nonce round-trip for replay protection: the RAW nonce goes to Supabase
  // (which re-hashes it to compare against the identity token's own nonce claim), but Apple's
  // signInAsync must be given the SHA256 hash of that same raw value, never the raw value itself
  // — passing the same string to both sides would make the token's nonce claim never match what
  // Supabase recomputes.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err: any) {
    if (err?.code === 'ERR_REQUEST_CANCELED') throw new AppleSignInCancelledError();
    throw err;
  }

  if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
  return { identityToken: credential.identityToken, rawNonce };
};

// Login (Landing → an existing account): starts a fresh session for whichever user this Apple
// identity belongs to, replacing the current anonymous one entirely — correct here, there's
// nothing on the anonymous session worth keeping at this point.
export const signInWithApple = async (): Promise<void> => {
  const { identityToken, rawNonce } = await getAppleCredential();
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: rawNonce });
  if (error) throw error;
};

// Account Creation (Summary → new account): must use linkIdentity, not signInWithIdToken —
// confirmed against Supabase's docs and the installed SDK's own types. signInWithIdToken always
// starts a new/separate session for that identity; linkIdentity is the one that attaches the
// Apple identity to the CURRENT (anonymous) session in place, preserving the same user_id and
// therefore the profile/plan just captured through onboarding.
export const linkAppleToCurrentUser = async (): Promise<void> => {
  const { identityToken, rawNonce } = await getAppleCredential();
  const { error } = await supabase.auth.linkIdentity({ provider: 'apple', token: identityToken, nonce: rawNonce });
  if (error) throw error;
};
