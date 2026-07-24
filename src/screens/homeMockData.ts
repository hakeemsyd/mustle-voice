import { colors } from '../constants/theme';

// Placeholder data — replace once nutrition_target/food_log and training_plan/plan_session
// are actually read from Supabase (see docs/coaching-brain.md). Kept in sync with the
// mustle-mvp design reference's mock values.
export interface MacroTarget {
  key: 'protein' | 'carbs' | 'fat' | 'calories';
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
}

export const MOCK_MACROS: MacroTarget[] = [
  { key: 'protein', label: 'Protein', current: 30, goal: 180, unit: 'g', color: colors.chartProtein },
  { key: 'carbs', label: 'Carbs', current: 110, goal: 260, unit: 'g', color: colors.chartCarbs },
  { key: 'fat', label: 'Fat', current: 28, goal: 70, unit: 'g', color: colors.chartFat },
  { key: 'calories', label: 'Calories', current: 860, goal: 2400, unit: 'kcal', color: colors.chartCalories },
];

export const MOCK_TODAY_SESSION = {
  hasSession: true,
  name: 'LEGS + CORE',
  startsInLabel: 'in 01:20',
};

export const MOCK_COACH_MESSAGE = "It's time for breakfast.\nLet's get protein in early.";

export const MOCK_STREAK_DAYS = 5;

export function getMomentumLine(streakDays: number): string {
  if (streakDays <= 0) return "Let's start your streak today";
  if (streakDays === 1) return "1-day streak · let's keep it going";
  return `${streakDays}-day streak · on track this week`;
}
