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
import { AppActionBridge } from './src/session/AppActionBridge';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { ScreenSetNewPassword } from './src/onboarding/screens/ScreenSetNewPassword';
import { colors } from './src/constants/theme';
import { supabase } from './src/lib/supabase';
import { subscribeToAccountReset } from './src/lib/appResetBridge';
import { parseRecoveryUrl } from './src/lib/passwordRecovery';

const AGENT_ID = process.env.EXPO_PUBLIC_AGENT_ID;
if (!AGENT_ID) {
  throw new Error('Missing EXPO_PUBLIC_AGENT_ID');
}

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
    if (!sessionReady) return;
    if (!userId) {
      setOnboarded(false);
      return;
    }

    let cancelled = false;
    supabase
      .from('profile')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[App] failed to check onboarding status:', error.message);
        setOnboarded(!!data);
      });

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
                <AppActionBridge userId={userId} />
                <RootStack />
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

export default App;
