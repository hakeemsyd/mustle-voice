// v0 macro/calorie formula — a standard bodyweight-based coaching heuristic, NOT a clinical
// or product-approved formula. Mifflin-St Jeor needs age, which onboarding doesn't collect;
// this is deterministic and good enough to unblock the brain, but flag for Damion sign-off
// before launch (same status as the Stats formulas — see docs/coaching-brain.md).

export type GoalObjective = 'cut' | 'bulk' | 'recomp' | 'maintain';

const CALORIES_PER_KG: Record<GoalObjective, number> = {
  cut: 24,
  recomp: 28,
  maintain: 31,
  bulk: 35,
};

const PROTEIN_G_PER_KG: Record<GoalObjective, number> = {
  cut: 2.2,
  recomp: 2.0,
  maintain: 1.8,
  bulk: 1.9,
};

const FAT_SHARE_OF_CALORIES = 0.25;

export interface NutritionTargets {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export function computeNutritionTargets(weightKg: number, goal: GoalObjective): NutritionTargets {
  const calories = Math.round(weightKg * CALORIES_PER_KG[goal]);
  const protein_g = Math.round(weightKg * PROTEIN_G_PER_KG[goal]);
  const fat_g = Math.round((calories * FAT_SHARE_OF_CALORIES) / 9);
  const remaining = calories - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remaining / 4));

  return { calories, protein_g, carbs_g, fat_g };
}
