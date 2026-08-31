import { GoogleSignin, isSuccessResponse, isCancelledResponse } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';

export class GoogleSignInCancelledError extends Error {}

const WEB_CLIENT_ID = '421703647517-5lbc8476kv0jd16kbtatjgj0a7k197u3.apps.googleusercontent.com';
const IOS_CLIENT_ID = '421703647517-95geinli07j49llb1lts4ms4prc06e4v.apps.googleusercontent.com';

let configured = false;
const ensureConfigured = () => {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
  configured = true;
};

// Google's native SDK doesn't support supplying a custom nonce for the ID token request the way
// Apple's does — Supabase's Google provider has "Skip nonce checks" enabled to match (see
// appleAuth.ts's nonce round-trip for how the Apple side differs).
const getGoogleIdToken = async (): Promise<string> => {
  ensureConfigured();
  const response = await GoogleSignin.signIn();
  if (isCancelledResponse(response)) throw new GoogleSignInCancelledError();
  if (!isSuccessResponse(response) || !response.data.idToken) {
    throw new Error('Google did not return an identity token.');
  }
  return response.data.idToken;
};

// Login (Landing → an existing account): starts a fresh session for whichever user this Google
// identity belongs to, replacing the current anonymous one entirely.
export const signInWithGoogle = async (): Promise<void> => {
  const idToken = await getGoogleIdToken();
  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
};

// Account Creation (Summary → new account): linkIdentity attaches the Google identity to the
// CURRENT (anonymous) session in place, preserving the same user_id — same reasoning as
// linkAppleToCurrentUser in appleAuth.ts.
export const linkGoogleToCurrentUser = async (): Promise<void> => {
  const idToken = await getGoogleIdToken();
  const { error } = await supabase.auth.linkIdentity({ provider: 'google', token: idToken });
  if (error) throw error;
};
