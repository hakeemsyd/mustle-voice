import { supabase } from './supabase';
import { heightToCm, weightToKg } from './units';
import { isAppleHealthAvailable, readHealthSnapshot } from './appleHealth';
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

  // Permission was already granted on ScreenHealthKit itself — this is the one place that
  // actually reads it, same as every other structured fact onboarding captures. Only the weight
  // sample is persisted for now: it has an obvious home (the same weight_log a manual entry
  // writes to). Steps/sleep/heart-rate/workout data is real and read successfully, but where it
  // should live (a new table? folded into the live readiness computation without persisting at
  // all?) is a schema decision that hasn't been made yet — flagged rather than guessed at here.
  // A user's own manually-entered onboarding weight always wins if both exist; this only fires
  // when they skipped that question or Health has a genuinely more recent reading.
  if (state.healthKitConnected) {
    try {
      const available = await isAppleHealthAvailable();
      if (available) {
        const snapshot = await readHealthSnapshot();
        if (snapshot.weightKg !== null && weightKg === null) {
          const { error } = await supabase
            .from('weight_log')
            .insert({ user_id: userId, weight_kg: snapshot.weightKg });
          logIfError('weight_log insert (Apple Health)', error);
        }
      }
    } catch (err) {
      console.error('[onboardingSync] Apple Health read failed:', err);
    }
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
