import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { MACRO_META, type MacroTarget } from "../screens/homeFormat";

export interface FoodLogEntry {
  id: string;
  description: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  at: string;
}

const MACRO_COLUMNS: Record<MacroTarget["key"], string> = {
  protein: "protein_g",
  carbs: "carbs_g",
  fat: "fat_g",
  calories: "calories",
};

export function useFuelData() {
  const [loading, setLoading] = useState(true);
  const [macros, setMacros] = useState<MacroTarget[] | null>(null);
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [nutritionRes, foodRes] = await Promise.all([
        supabase.from("nutrition_target").select("calories, protein_g, carbs_g, fat_g").eq("user_id", userId).maybeSingle(),
        supabase
          .from("food_log")
          .select("id, description, calories, protein_g, carbs_g, fat_g, at")
          .eq("user_id", userId)
          .gte("at", startOfDay.toISOString())
          .order("at", { ascending: false }),
      ]);
      if (cancelled) return;

      const nutrition = nutritionRes.data;
      const foodRows = foodRes.data ?? [];

      const nextMacros: MacroTarget[] | null = nutrition
        ? (Object.keys(MACRO_META) as MacroTarget["key"][]).map((key) => {
            const goal = (nutrition as any)[MACRO_COLUMNS[key]] ?? 0;
            const current = foodRows.reduce((sum, row: any) => sum + (row[MACRO_COLUMNS[key]] ?? 0), 0);
            return { key, ...MACRO_META[key], current, goal };
          })
        : null;

      setMacros(nextMacros);
      setEntries(
        foodRows.map((row: any) => ({
          id: row.id,
          description: row.description,
          calories: row.calories ?? 0,
          proteinG: row.protein_g ?? 0,
          carbsG: row.carbs_g ?? 0,
          fatG: row.fat_g ?? 0,
          at: row.at,
        })),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  const deleteEntry = useCallback(
    async (id: string) => {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      const { error } = await supabase.from("food_log").delete().eq("id", id);
      if (error) {
        console.error("[fuel] failed to delete food log entry:", error.message);
        refetch();
      }
    },
    [refetch],
  );

  return { loading, macros, entries, deleteEntry, refetch };
}
