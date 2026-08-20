import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationProvider } from '@elevenlabs/react-native';
import { useAppFonts } from './src/theme/useAppFonts';
import { RootStack } from './src/navigation/RootStack';
import { navigationRef } from './src/navigation/navigationRef';
import { ActiveSessionProvider } from './src/session/ActiveSessionContext';
import { AppActionBridge } from './src/session/AppActionBridge';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { colors } from './src/constants/theme';
import { useEnsureSession } from './src/hooks/useEnsureSession';
import { supabase } from './src/lib/supabase';

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
  const { userId, ready: sessionReady } = useEnsureSession();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

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

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {!fontsLoaded || !sessionReady || onboarded === null ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : !onboarded ? (
          <OnboardingFlow userId={userId} onComplete={handleOnboardingComplete} />
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
