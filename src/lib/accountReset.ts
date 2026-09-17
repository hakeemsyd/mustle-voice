import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { setCachedDisplayName } from './profileStore';
import { ONBOARDING_DRAFT_KEY } from '../onboarding/useOnboardingState';

// Child-before-parent order — every consumer deletes straight down this list.
const DERIVED_TABLES = [
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
  'goal_history',
  'goal',
] as const;

const RESET_TABLES = [...DERIVED_TABLES, 'biometrics', 'profile'] as const;

/** Everything an account accumulates *after* onboarding answered for it — the plan, targets,
 *  injuries, logs and chat history. Onboarding rewrites the profile and biometrics rows it owns
 *  by upsert, but it only ever inserted into these, so a second run left the previous account's
 *  plan, calorie target, injuries, weight history and chat sitting underneath the new answers.
 *  That is what surfaced as a freshly-onboarded profile already holding a 6-day split, a calorie
 *  target nothing had generated, injuries never entered, and last week's weight to compare
 *  against. Clearing them makes onboarding a replacement rather than a merge. */
export async function clearDerivedAccountState(userId: string): Promise<void> {
  for (const table of DERIVED_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`clear failed on ${table}: ${error.message}`);
  }
}

export async function resetTestAccount(userId: string): Promise<void> {
  for (const table of RESET_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    if (error) throw new Error(`reset failed on ${table}: ${error.message}`);
  }

  await AsyncStorage.removeItem(ONBOARDING_DRAFT_KEY);
  setCachedDisplayName(userId, null);
}
