import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { MACRO_META, type MacroTarget } from "../screens/homeFormat";
import { addDays, localDateKey } from "../lib/calendarDate";

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

function mapFoodRows(rows: any[]): FoodLogEntry[] {
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    calories: row.calories ?? 0,
    proteinG: row.protein_g ?? 0,
    carbsG: row.carbs_g ?? 0,
    fatG: row.fat_g ?? 0,
    at: row.at,
  }));
}

export function useFuelData() {
  const [loading, setLoading] = useState(true);
  const [macros, setMacros] = useState<MacroTarget[] | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  // Today's own totals for the macro ring — always today, independent of whichever date the
  // Meals Logged tab below is browsing.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) {
        if (!cancelled) setLoading(false);
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [nutritionRes, foodRes] = await Promise.all([
        supabase.from("nutrition_target").select("calories, protein_g, carbs_g, fat_g").eq("user_id", uid).maybeSingle(),
        supabase
          .from("food_log")
          .select("id, description, calories, protein_g, carbs_g, fat_g, at")
          .eq("user_id", uid)
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
      setUserId(uid);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  // Meals Logged tab — independently browsable back through past days, per Damion's Sep 7 ask
  // ("the calendar is also missing to check the previous logged meals"). Defaults to today,
  // same day the ring above always shows, but doesn't move when the ring's own date doesn't.
  const todayKey = localDateKey(new Date());
  const [loggedDate, setLoggedDate] = useState(todayKey);
  const [loggedEntries, setLoggedEntries] = useState<FoodLogEntry[]>([]);
  const [loggedLoading, setLoggedLoading] = useState(true);
  const canGoToNextDay = loggedDate < todayKey;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoggedLoading(true);

    (async () => {
      const dayStart = new Date(`${loggedDate}T00:00:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const { data } = await supabase
        .from("food_log")
        .select("id, description, calories, protein_g, carbs_g, fat_g, at")
        .eq("user_id", userId)
        .gte("at", dayStart.toISOString())
        .lt("at", dayEnd.toISOString())
        .order("at", { ascending: false });
      if (cancelled) return;

      setLoggedEntries(mapFoodRows(data ?? []));
      setLoggedLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loggedDate, refetchSignal]);

  const goToPreviousDay = useCallback(() => {
    setLoggedDate((d) => localDateKey(addDays(new Date(`${d}T00:00:00`), -1)));
  }, []);
  const goToNextDay = useCallback(() => {
    setLoggedDate((d) => {
      const next = localDateKey(addDays(new Date(`${d}T00:00:00`), 1));
      return next > todayKey ? d : next;
    });
  }, [todayKey]);

  return {
    loading,
    macros,
    refetch,
    loggedDate,
    setLoggedDate,
    loggedEntries,
    loggedLoading,
    goToPreviousDay,
    goToNextDay,
    canGoToNextDay,
    todayKey,
  };
}
