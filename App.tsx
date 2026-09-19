import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationProvider } from '@elevenlabs/react-native';
import * as Linking from 'expo-linking';
import { useAppFonts } from './src/theme/useAppFonts';
import { RootStack } from './src/navigation/RootStack';
import { navigationRef } from './src/navigation/navigationRef';
import { ActiveSessionProvider } from './src/session/ActiveSessionContext';
import { VoiceSessionProvider } from './src/session/VoiceSessionProvider';
import { AppActionBridge } from './src/session/AppActionBridge';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { ScreenSetNewPassword } from './src/onboarding/screens/ScreenSetNewPassword';
import { colors } from './src/constants/theme';
import { supabase } from './src/lib/supabase';
import { subscribeToAccountReset } from './src/lib/appResetBridge';
import { parseRecoveryUrl } from './src/lib/passwordRecovery';
import * as Sentry from '@sentry/react-native';
import { initCrashReporting } from './src/lib/crashReporting';

initCrashReporting();

const AGENT_ID = process.env.EXPO_PUBLIC_AGENT_ID;
if (!AGENT_ID) {
  throw new Error('Missing EXPO_PUBLIC_AGENT_ID');
}

const ONBOARDING_CHECK_RETRY_MS = 600;
const ONBOARDING_CHECK_MAX_RETRY_MS = 5_000;

const navTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.surface,
    primary: colors.accent,
    text: colors.text,
    border: colors.border,
  },
};

const isDeletedUserError = (error: { message?: string; code?: string; status?: number } | null): boolean =>
  !!error &&
  (error.code === 'user_not_found' ||
    /user from sub claim in jwt does not exist/i.test(error.message ?? ''));

const App = () => {
  const fontsLoaded = useAppFonts();
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [justLoggedOut, setJustLoggedOut] = useState(false);
  const [recovery, setRecovery] = useState<{ error: string | null } | null>(null);

  // Reacts to every auth change for the lifetime of the app — login, logout, the initial
  // anonymous bootstrap, token refresh — not just once at mount. This is what makes Login and
  // Settings' Logout work without a manual "tell App.tsx to recheck" bridge: signOut()/
  // signInWithPassword() fire this automatically, from anywhere.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        setUserId(session.user.id);
      } else {
        // No session at all — true on first launch, and again right after a deliberate
        // logout. Clear state immediately rather than waiting on the re-signin below, so a
        // logout can't leave the previous user's Home screen showing for that gap. Always
        // keep at least an anonymous session active; this re-fires this same handler once it
        // succeeds, with the fresh anon session.
        setUserId(null);
        setOnboarded(null);
        // Only a real SIGNED_OUT event means "skip Splash" — a true cold launch (no session
        // ever existed yet) fires with a different event and should still show the intro.
        if (event === 'SIGNED_OUT') setJustLoggedOut(true);
        supabase.auth
          .signInAnonymously()
          .catch((err) => console.error('[App] failed to start anonymous session:', err));
      }
      setSessionReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      const { error } = await supabase.auth.getUser();
      if (cancelled || !isDeletedUserError(error)) return;
      console.warn('[App] stored session belongs to a deleted account — clearing it');
      await supabase.auth.signOut({ scope: 'local' });
      if (!cancelled) await supabase.auth.signInAnonymously();
    })().catch((err) => console.error('[App] failed to validate stored session:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    if (!userId) {
      setOnboarded(false);
      return;
    }

    let cancelled = false;

    const check = async (attempt: number): Promise<void> => {
      const { data, error } = await supabase
        .from('profile')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;

      if (error) {
        console.error('[App] failed to check onboarding status:', error.message);
        setTimeout(
          () => {
            if (!cancelled) void check(attempt + 1);
          },
          Math.min(ONBOARDING_CHECK_RETRY_MS * attempt, ONBOARDING_CHECK_MAX_RETRY_MS),
        );
        return;
      }

      setOnboarded(!!data);
    };

    void check(1);

    return () => {
      cancelled = true;
    };
  }, [sessionReady, userId]);

  const handleOnboardingComplete = useCallback(() => {
    setOnboarded(true);
  }, []);

  useEffect(
    () =>
      subscribeToAccountReset(() => {
        setOnboarded(false);
        setJustLoggedOut(true);
      }),
    [],
  );

  // Tapping a password-reset email link opens the app at mustle://reset-password#access_token=
  // ...&type=recovery (see src/lib/passwordRecovery.ts) — cold start goes through getInitialURL,
  // an already-running app gets the 'url' event instead. setSession swaps in the recovery
  // session for whichever account requested it; the render below then forces
  // ScreenSetNewPassword regardless of onboarding state until it resolves.
  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return;
      if (!url.includes('reset-password')) return;
      const result = parseRecoveryUrl(url);
      if (!result) return;
      if (result.type === 'error') {
        setRecovery({ error: result.message });
        return;
      }
      setRecovery({ error: null });
      supabase.auth
        .setSession({ access_token: result.accessToken, refresh_token: result.refreshToken })
        .then(({ error }) => {
          if (error) {
            console.error('[App] failed to start password recovery session:', error.message);
            setRecovery({ error: error.message });
          }
        });
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {!fontsLoaded ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : recovery !== null ? (
          <ScreenSetNewPassword
            linkError={recovery.error}
            onDone={() => setRecovery(null)}
            onCancel={() => setRecovery(null)}
          />
        ) : !sessionReady || onboarded === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !onboarded ? (
          <OnboardingFlow
            userId={userId}
            onComplete={handleOnboardingComplete}
            skipSplash={justLoggedOut}
          />
        ) : (
          <ConversationProvider agentId={AGENT_ID}>
            <NavigationContainer ref={navigationRef} theme={navTheme}>
              <ActiveSessionProvider>
                <VoiceSessionProvider>
                  <AppActionBridge userId={userId} />
                  <RootStack />
                </VoiceSessionProvider>
              </ActiveSessionProvider>
            </NavigationContainer>
          </ConversationProvider>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = {
  flex: { flex: 1 },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
} as const;

export default Sentry.wrap(App);
