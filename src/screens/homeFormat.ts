import { colors } from '../constants/theme';

export type TimeBand = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export const getTimeBand = (hour: number): TimeBand => {
  if (hour < 5) return 'Night';
  if (hour < 12) return 'Morning';
  if (hour < 18) return 'Afternoon';
  if (hour < 22) return 'Evening';
  return 'Night';
};

export interface MacroTarget {
  key: 'protein' | 'carbs' | 'fat' | 'calories';
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
}

export const MACRO_META: Record<MacroTarget['key'], { label: string; unit: string; color: string }> = {
  protein: { label: 'Protein', unit: 'g', color: colors.chartProtein },
  carbs: { label: 'Carbs', unit: 'g', color: colors.chartCarbs },
  fat: { label: 'Fat', unit: 'g', color: colors.chartFat },
  calories: { label: 'Calories', unit: 'kcal', color: colors.chartCalories },
};

export function getMomentumLine(streakDays: number): string {
  if (streakDays <= 0) return "Let's start your streak today";
  if (streakDays === 1) return "1-day streak · let's keep it going";
  return `${streakDays}-day streak · on track this week`;
}
