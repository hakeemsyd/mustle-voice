export interface FoodLogRow {
  description: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export const NOTHING_LOGGED_TODAY =
  'Food logged today: nothing yet. This is confirmed, not missing data. If they ask what to eat or how their day ' +
  'looks, say plainly that nothing is logged yet and answer from their targets, e.g. "nothing logged yet, so the ' +
  'full 150 g of protein is still open". Never describe a target as what they have eaten ("you\'re at 156 g"), and ' +
  'answer the question they asked rather than asking what they ate first.';

export function describeTodaysFoodLog(entries: FoodLogRow[]): string | null {
  if (entries.length === 0) return NOTHING_LOGGED_TODAY;

  const totals = entries.reduce(
    (sum, e) => ({
      calories: sum.calories + (e.calories ?? 0),
      protein_g: sum.protein_g + (e.protein_g ?? 0),
      carbs_g: sum.carbs_g + (e.carbs_g ?? 0),
      fat_g: sum.fat_g + (e.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const list = entries
    .map(
      (e) =>
        `${e.description} (${Math.round(e.calories ?? 0)} cal, ${Math.round(e.protein_g ?? 0)}g protein, ` +
        `${Math.round(e.carbs_g ?? 0)}g carbs, ${Math.round(e.fat_g ?? 0)}g fat)`,
    )
    .join('; ');

  return (
    `Logged today so far (${Math.round(totals.calories)} cal, ${Math.round(totals.protein_g)}g protein, ` +
    `${Math.round(totals.carbs_g)}g carbs, ${Math.round(totals.fat_g)}g fat total): ${list}. This is the ` +
    `complete, already-retrieved list for today. If asked where any part of today's total came from, answer ` +
    `directly from this list — never say you don't have a breakdown, never guess, and never call read_state ` +
    `or show_nutrition_summary just to answer that question.`
  );
}

export interface NutritionTargetRow {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export function describeNutritionTargets(target: NutritionTargetRow | null, entries: FoodLogRow[] | null): string | null {
  if (!target || !(target.calories || target.protein_g)) return null;
  const sum = (key: keyof FoodLogRow) =>
    Math.round((entries ?? []).reduce((total, e) => total + (Number(e[key]) || 0), 0));
  const goal = {
    calories: Math.round(target.calories ?? 0),
    protein: Math.round(target.protein_g ?? 0),
    carbs: Math.round(target.carbs_g ?? 0),
    fat: Math.round(target.fat_g ?? 0),
  };
  const targets = `${goal.calories} cal, ${goal.protein}g protein, ${goal.carbs}g carbs, ${goal.fat}g fat`;
  if (!entries) {
    return `Their daily nutrition targets: ${targets}. These are targets, not what they have eaten.`;
  }
  const eaten = { calories: sum('calories'), protein: sum('protein_g'), carbs: sum('carbs_g'), fat: sum('fat_g') };
  const left = (target: number, done: number) => Math.max(0, target - done);
  return (
    `Their daily nutrition targets: ${targets}. Logged so far today: ${eaten.calories} cal, ${eaten.protein}g protein, ` +
    `${eaten.carbs}g carbs, ${eaten.fat}g fat. Still to go today: ${left(goal.calories, eaten.calories)} cal, ` +
    `${left(goal.protein, eaten.protein)}g protein, ${left(goal.carbs, eaten.carbs)}g carbs, ${left(goal.fat, eaten.fat)}g fat. ` +
    'Answer "how much is left" questions from these numbers; never ask them for their targets, and never describe a target as eaten.'
  );
}
