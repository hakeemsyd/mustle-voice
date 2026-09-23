export interface FoodLogRow {
  description: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export function describeTodaysFoodLog(entries: FoodLogRow[]): string | null {
  if (entries.length === 0) return null;

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
