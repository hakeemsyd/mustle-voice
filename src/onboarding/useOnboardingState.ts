import { useCallback, useState } from 'react';

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

export const useOnboardingState = () => {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);

  const update = useCallback((partial: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const complete = useCallback(() => {
    setState((prev) => ({ ...prev, completedAt: new Date().toISOString() }));
  }, []);

  return { state, update, complete };
};
