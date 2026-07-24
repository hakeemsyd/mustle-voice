import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const SESSION_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Session bootstrap timed out')), ms)),
  ]);
}

// Never blocks the app indefinitely: if the backend is unreachable (paused project, anonymous
// sign-ins disabled, no network), `ready` still becomes true — just with userId null — so
// onboarding is still usable in a degraded, unsynced state instead of a dead spinner.
export function useEnsureSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
        let session = data.session;

        if (!session) {
          const { data: signInData, error: signInError } = await withTimeout(
            supabase.auth.signInAnonymously(),
            SESSION_TIMEOUT_MS,
          );
          if (signInError) throw signInError;
          session = signInData.session;
        }

        if (!cancelled) setUserId(session?.user.id ?? null);
      } catch (err) {
        console.error('[useEnsureSession] falling back without a session:', err);
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setSettled(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { userId, ready: settled, error };
}
