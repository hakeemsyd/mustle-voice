import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme, type Theme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ConversationProvider } from '@elevenlabs/react-native';
import { useAppFonts } from './src/theme/useAppFonts';
import { RootNavigator } from './src/navigation/RootNavigator';
import { OnboardingFlow } from './src/onboarding/OnboardingFlow';
import { colors } from './src/constants/theme';
import { useEnsureSession } from './src/hooks/useEnsureSession';

const ONBOARDING_COMPLETE_KEY = 'onboarding_complete_v1';

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
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)
      .then((value) => setOnboarded(value === 'true'))
      .catch((err) => {
        console.error('[App] failed to read onboarding completion flag:', err);
        setOnboarded(false);
      });
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true').catch((err) =>
      console.error('[App] failed to persist onboarding completion flag:', err),
    );
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
            <NavigationContainer theme={navTheme}>
              <RootNavigator />
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
