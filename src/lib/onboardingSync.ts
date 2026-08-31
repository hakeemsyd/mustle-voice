import { supabase } from './supabase';
import { heightToCm, weightToKg } from './units';
import type { OnboardingState } from '../onboarding/useOnboardingState';

function logIfError(label: string, error: { message: string } | null) {
  if (error) console.error(`[onboardingSync] ${label} failed:`, error.message);
}

// Writes the structured facts onboarding can capture without inventing a classification
// (profile, biometrics, weight, injuries), and logs the free-text answers (training
// history, goal, injury description) as conversation history for the brain to read when
// it generates the first plan — see docs/coaching-brain.md.
export async function syncOnboarding(userId: string, state: OnboardingState) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const heightCm = state.height ? heightToCm(state.height, state.units) : null;
  const weightKg = state.weight ? weightToKg(state.weight, state.units) : null;

  const { error: profileError } = await supabase.from('profile').upsert({
    user_id: userId,
    display_name: state.userName || null,
    unit_prefs: state.units,
    timezone,
  });
  logIfError('profile upsert', profileError);

  const { error: biometricsError } = await supabase.from('biometrics').upsert({
    user_id: userId,
    sex: state.gender,
    height_cm: heightCm,
    weekly_frequency: state.weeklyFrequency,
  });
  logIfError('biometrics upsert', biometricsError);

  if (weightKg !== null) {
    const { error } = await supabase.from('weight_log').insert({ user_id: userId, weight_kg: weightKg });
    logIfError('weight_log insert', error);
  }

  if (state.injuries.length > 0) {
    const { error } = await supabase.from('injury').insert(
      state.injuries.map((area) => ({
        user_id: userId,
        area,
        status: 'active' as const,
        note: state.injuryDescription || null,
      })),
    );
    logIfError('injury insert', error);
  }

  const conversation: string[] = [];
  if (state.trainingHistory) conversation.push(`Training history: ${state.trainingHistory}`);
  if (state.primaryGoal) conversation.push(`Primary goal: ${state.primaryGoal}`);
  if (state.weeklyFrequency !== null) conversation.push(`Weekly training frequency: ${state.weeklyFrequency} days/week`);
  if (state.injuryDescription) conversation.push(`Injury notes: ${state.injuryDescription}`);

  if (conversation.length > 0) {
    const { error } = await supabase.from('message').insert(
      conversation.map((content) => ({
        user_id: userId,
        role: 'user' as const,
        content,
        modality: 'text' as const,
      })),
    );
    logIfError('message insert', error);
  }
}
