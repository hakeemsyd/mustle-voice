import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OnboardingState {
  micEnabled: boolean;
  pushEnabled: boolean;
  gender: 'male' | 'female' | 'prefer_not_to_say' | null;
  userName: string;
  trainingHistory: string;
  primaryGoal: string;
  weeklyFrequency: number | null;
  height: string | null;
  weight: string | null;
  units: 'metric' | 'imperial';
  injuries: string[];
  injuryDescription: string;
  healthKitConnected: boolean;
  completedAt: string | null;
}

const DEFAULT_STATE: OnboardingState = {
  micEnabled: false,
  pushEnabled: false,
  gender: null,
  userName: '',
  trainingHistory: '',
  primaryGoal: '',
  weeklyFrequency: null,
  height: null,
  weight: null,
  units: 'imperial',
  injuries: [],
  injuryDescription: '',
  healthKitConnected: false,
  completedAt: null,
};

const DRAFT_KEY = 'onboarding_draft_v1';

interface OnboardingDraft {
  screenIndex: number;
  state: OnboardingState;
}

export const useOnboardingState = () => {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [screenIndex, setScreenIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (raw) {
          const draft: OnboardingDraft = JSON.parse(raw);
          setState(draft.state);
          setScreenIndex(draft.screenIndex);
        }
      } catch (err) {
        console.error('[onboarding] failed to load saved progress:', err);
      } finally {
        loadedRef.current = true;
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    const draft: OnboardingDraft = { screenIndex, state };
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch((err) =>
      console.error('[onboarding] failed to save progress:', err),
    );
  }, [state, screenIndex]);

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const goTo = useCallback((index: number) => setScreenIndex(index), []);
  const goNext = useCallback(() => setScreenIndex((i) => i + 1), []);
  const goBack = useCallback(() => setScreenIndex((i) => Math.max(0, i - 1)), []);

  const complete = useCallback(() => {
    setState((prev) => ({ ...prev, completedAt: new Date().toISOString() }));
  }, []);

  const clearDraft = useCallback(() => {
    AsyncStorage.removeItem(DRAFT_KEY).catch((err) =>
      console.error('[onboarding] failed to clear saved progress:', err),
    );
  }, []);

  return { state, screenIndex, ready, update, goTo, goNext, goBack, complete, clearDraft };
};
