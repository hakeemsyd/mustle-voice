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

export const ONBOARDING_DRAFT_KEY = 'onboarding_draft_v1';
const DRAFT_KEY = ONBOARDING_DRAFT_KEY;

interface OnboardingDraft {
  screenIndex: number;
  state: OnboardingState;
}

export const useOnboardingState = () => {
  const [state, setState] = useState<OnboardingState>(DEFAULT_STATE);
  const [screenIndex, setScreenIndex] = useState(0);
  const [ready, setReady] = useState(false);
  const loadedRef = useRef(false);
  // Set only by editStep (Summary jumping into a step to edit it) — goNext reads and clears it,
  // so the very next "Continue" tap after an edit returns to Summary instead of falling through
  // to whatever screen normally comes after this one in the linear flow. Confirmed live: tapping
  // a Summary row, editing, and hitting Continue landed on the NEXT onboarding step, not back at
  // Summary — every screen's onNext just calls this same shared goNext with no way to know it
  // was reached out of sequence. A ref, not state: it's read-and-cleared synchronously inside
  // goNext's own updater, never rendered, and never needs to survive an app relaunch — resuming
  // a killed-mid-edit session at the next linear step instead of back at Summary is an acceptable
  // edge case, not worth widening the persisted draft shape for.
  const editReturnIndexRef = useRef<number | null>(null);

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

  // Any plain jump invalidates a pending edit-return — otherwise bailing out of an edit via the
  // header back button (rather than Continue) leaves a stale return target that could later fire
  // on some unrelated goNext call, long after the user gave up on that edit.
  const goTo = useCallback((index: number) => {
    editReturnIndexRef.current = null;
    setScreenIndex(index);
  }, []);

  // Summary jumping into a step to edit it — records where to come back to. The only way this
  // ref gets set; every other navigation function clears it.
  const editStep = useCallback((targetIndex: number) => {
    setScreenIndex((current) => {
      editReturnIndexRef.current = current;
      return targetIndex;
    });
  }, []);

  const goNext = useCallback(() => {
    setScreenIndex((i) => {
      const returnTo = editReturnIndexRef.current;
      if (returnTo !== null) {
        editReturnIndexRef.current = null;
        return returnTo;
      }
      return i + 1;
    });
  }, []);

  const goBack = useCallback(() => {
    editReturnIndexRef.current = null;
    setScreenIndex((i) => Math.max(0, i - 1));
  }, []);

  const complete = useCallback(() => {
    setState((prev) => ({ ...prev, completedAt: new Date().toISOString() }));
  }, []);

  const clearDraft = useCallback(() => {
    AsyncStorage.removeItem(DRAFT_KEY).catch((err) =>
      console.error('[onboarding] failed to clear saved progress:', err),
    );
  }, []);

  return { state, screenIndex, ready, update, goTo, editStep, goNext, goBack, complete, clearDraft };
};
