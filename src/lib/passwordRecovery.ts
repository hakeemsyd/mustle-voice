import * as Linking from 'expo-linking';

export type RecoveryLinkResult =
  | { type: 'recovery'; accessToken: string; refreshToken: string }
  | { type: 'error'; message: string };

// RN's global environment doesn't reliably ship URLSearchParams, so the fragment is parsed by
// hand rather than gambling on it being present.
function parseFragmentParams(fragment: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of fragment.split('&')) {
    if (!pair) continue;
    const [key, value = ''] = pair.split('=');
    params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return params;
}

// Supabase's password-reset email links redirect to `${redirectTo}#access_token=...&
// refresh_token=...&type=recovery` — a URL fragment, not query params, because this project
// never set `flowType: 'pkce'` on the Supabase client (see src/lib/supabase.ts), so it's on the
// older implicit flow. An expired/invalid link redirects with `#error=...&error_description=...`
// instead, which is surfaced as a friendly message rather than silently doing nothing.
export function parseRecoveryUrl(url: string): RecoveryLinkResult | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = parseFragmentParams(url.slice(hashIndex + 1));

  if (params.error) {
    return {
      type: 'error',
      message: params.error_description || 'This reset link is no longer valid — request a new one.',
    };
  }
  if (params.type === 'recovery' && params.access_token && params.refresh_token) {
    return { type: 'recovery', accessToken: params.access_token, refreshToken: params.refresh_token };
  }
  return null;
}

export function buildPasswordResetRedirectUrl(): string {
  return Linking.createURL('reset-password');
}
