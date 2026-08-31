import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { setCachedDisplayName } from './profileStore';
import { ONBOARDING_DRAFT_KEY } from '../onboarding/useOnboardingState';

const RESET_TABLES = [
  'app_action',
  'exercise_note',
  'message',
  'checkin_log',
  'workout_log',
  'food_log',
  'nutrition_target',
  'plan_exercise',
  'plan_session',
  'training_plan',
  'injury',
  'weight_log',
  'biometrics',
  'goal_history',
  'goal',
  'profile',
] as const;

export async function resetTestAccount(userId: string): Promise<void> {
  for (const table of RESET_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`reset failed on ${table}: ${error.message}`);
  }

  await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
  setCachedDisplayName(userId, null);
}
