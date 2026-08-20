import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface DayStatus {
  label: string;
  status: "completed" | "missed" | "rest";
}

export interface TopLift {
  name: string;
  topWeightLb: number;
  trend: number[];
}

export interface StatsData {
  loading: boolean;
  hasTrainingData: boolean;
  performanceScore: number;
  performanceTrend: number[];
  readinessScore: number;
  readinessLabel: string;
  calories: { value: number; target: number };
  macros: { label: string; value: number; target: number; unit: string }[];
  muscleFrequency: { group: string; sessions: number }[];
  streakDays: number;
  weeklyVolumeLb: number;
  volumeDeltaPct: number | null;
  topLifts: TopLift[];
  consistency: { completed: number; planned: number; pct: number; prevPct: number; days: DayStatus[] };
  refetch: () => void;
}

interface ExerciseSetShape {
  name: string;
  sets: number;
  reps: string;
  load: string;
}

function settled<T>(work: PromiseLike<T>): Promise<{ data: any; error: any }> {
  return Promise.resolve(work).then(
    (res: any) => res,
    (err) => ({ data: null, error: err }),
  );
}

function parseLoads(load: string): number[] {
  return load
    .split(",")
    .map((v) => parseFloat(v))
    .filter((v) => Number.isFinite(v));
}

function parseReps(reps: string): number[] {
  return reps
    .split(",")
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v));
}

function kgKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEK_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export function useStatsData(): StatsData {
  const [state, setState] = useState<Omit<StatsData, "refetch">>({
    loading: true,
    hasTrainingData: false,
    performanceScore: 0,
    performanceTrend: [],
    readinessScore: 0,
    readinessLabel: "",
    calories: { value: 0, target: 0 },
    macros: [],
    muscleFrequency: [],
    streakDays: 0,
    weeklyVolumeLb: 0,
    volumeDeltaPct: null,
    topLifts: [],
    consistency: { completed: 0, planned: 0, pct: 0, prevPct: 0, days: [] },
  });
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
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [planRes, workoutRes, foodRes, nutritionRes, exerciseRes] = await Promise.all([
        settled(
          supabase
            .from("training_plan")
            .select("days_per_week, plan_session(id, day_order, weekday)")
            .eq("user_id", userId)
            .eq("status", "active")
            .maybeSingle(),
        ),
        settled(
          supabase
            .from("workout_log")
            .select("at, plan_session_id, status, exercises_done")
            .eq("user_id", userId)
            .gte("at", ninetyDaysAgo.toISOString())
            .order("at", { ascending: false }),
        ),
        settled(
          supabase
            .from("food_log")
            .select("calories, protein_g, carbs_g, fat_g, at")
            .eq("user_id", userId)
            .gte("at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
        ),
        settled(
          supabase.from("nutrition_target").select("calories, protein_g, carbs_g, fat_g").eq("user_id", userId).maybeSingle(),
        ),
        settled(supabase.from("exercise").select("name, primary_muscles")),
      ]);
      if (cancelled) return;

      const plan = planRes.data;
      const workouts = (workoutRes.data ?? []) as {
        at: string;
        plan_session_id: string | null;
        status: string;
        exercises_done: ExerciseSetShape[];
      }[];
      const hasTrainingData = workouts.length > 0;

      // ── Consistency (last 7 calendar days) ──────────────────────────────
      const pinnedWeekdays = new Set(
        (plan?.plan_session ?? []).map((s: any) => s.weekday).filter((w: number | null) => w !== null),
      );
      const days: DayStatus[] = [];
      let completedThisWeek = 0;
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const completedToday = workouts.some(
          (w) => w.status !== "partial" && kgKey(new Date(w.at)) === kgKey(d),
        );
        if (completedToday) completedThisWeek++;
        const status: DayStatus["status"] = completedToday
          ? "completed"
          : pinnedWeekdays.has(d.getDay())
            ? "missed"
            : "rest";
        days.push({ label: WEEK_LABELS[d.getDay()], status });
      }
      const planned = plan?.days_per_week ?? pinnedWeekdays.size;
      const pct = planned > 0 ? Math.min(100, Math.round((completedThisWeek / planned) * 100)) : 0;

      let completedLastWeek = 0;
      for (let i = 13; i >= 7; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        if (workouts.some((w) => w.status !== "partial" && kgKey(new Date(w.at)) === kgKey(d))) completedLastWeek++;
      }
      const prevPct = planned > 0 ? Math.min(100, Math.round((completedLastWeek / planned) * 100)) : 0;

      // ── Streak ───────────────────────────────────────────────────────────
      const workoutDays = new Set(workouts.filter((w) => w.status !== "partial").map((w) => kgKey(new Date(w.at))));
      let streakDays = 0;
      const cursor = new Date();
      if (!workoutDays.has(kgKey(cursor))) cursor.setDate(cursor.getDate() - 1);
      while (workoutDays.has(kgKey(cursor))) {
        streakDays++;
        cursor.setDate(cursor.getDate() - 1);
      }

      // ── Muscle group frequency (this week) ──────────────────────────────
      const muscleMap = new Map<string, string[]>(
        (exerciseRes.data ?? []).map((e: any) => [e.name, e.primary_muscles ?? []]),
      );
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const thisWeekWorkouts = workouts.filter((w) => new Date(w.at) >= weekAgo);
      const muscleCounts = new Map<string, number>();
      for (const w of thisWeekWorkouts) {
        const musclesThisSession = new Set<string>();
        for (const ex of w.exercises_done ?? []) {
          for (const m of muscleMap.get(ex.name) ?? []) musclesThisSession.add(m);
        }
        for (const m of musclesThisSession) muscleCounts.set(m, (muscleCounts.get(m) ?? 0) + 1);
      }
      const muscleFrequency = Array.from(muscleCounts.entries())
        .map(([group, sessions]) => ({ group: group.replace(/\b\w/g, (c) => c.toUpperCase()), sessions }))
        .sort((a, b) => b.sessions - a.sessions);

      // ── Volume (this week vs last week), lb·reps ────────────────────────
      function volumeFor(rows: typeof workouts): number {
        let total = 0;
        for (const w of rows) {
          for (const ex of w.exercises_done ?? []) {
            const loads = parseLoads(ex.load);
            const reps = parseReps(ex.reps);
            const n = Math.min(loads.length, reps.length);
            for (let i = 0; i < n; i++) total += loads[i] * reps[i];
          }
        }
        return Math.round(total);
      }
      const twoWeeksAgo = new Date(Date.now() - 14 * 86_400_000);
      const weeklyVolumeLb = volumeFor(thisWeekWorkouts);
      const lastWeekVolumeLb = volumeFor(workouts.filter((w) => new Date(w.at) >= twoWeeksAgo && new Date(w.at) < weekAgo));
      const volumeDeltaPct =
        lastWeekVolumeLb > 0 ? Math.round(((weeklyVolumeLb - lastWeekVolumeLb) / lastWeekVolumeLb) * 100) : null;

      // ── Top lifts (all-time-in-window max load per exercise) ────────────
      const byExercise = new Map<string, number[]>();
      for (const w of workouts.slice().reverse()) {
        for (const ex of w.exercises_done ?? []) {
          const loads = parseLoads(ex.load);
          if (loads.length === 0) continue;
          const arr = byExercise.get(ex.name) ?? [];
          arr.push(Math.max(...loads));
          byExercise.set(ex.name, arr);
        }
      }
      const topLifts: TopLift[] = Array.from(byExercise.entries())
        .map(([name, trend]) => ({ name, topWeightLb: Math.max(...trend), trend: trend.slice(-7) }))
        .sort((a, b) => b.topWeightLb - a.topWeightLb)
        .slice(0, 3);

      // ── Nutrition adherence (protein-target hit days, last 7) ───────────
      const nutrition = nutritionRes.data;
      const foodRows = (foodRes.data ?? []) as { calories: number; protein_g: number; at: string }[];
      const proteinByDay = new Map<string, number>();
      const caloriesToday = foodRows
        .filter((r) => new Date(r.at) >= startOfDay)
        .reduce((sum, r) => sum + (r.calories ?? 0), 0);
      for (const r of foodRows) {
        const key = kgKey(new Date(r.at));
        proteinByDay.set(key, (proteinByDay.get(key) ?? 0) + (r.protein_g ?? 0));
      }
      const proteinTarget = nutrition?.protein_g ?? 0;
      const proteinDaysHit =
        proteinTarget > 0 ? Array.from(proteinByDay.values()).filter((p) => p >= proteinTarget).length : 0;
      const proteinAdherencePct = proteinTarget > 0 ? Math.round((proteinDaysHit / 7) * 100) : 0;

      // ── Performance Score — first-pass composite heuristic:
      // 50% this-week completion rate + 30% protein-target adherence + 20% volume trend
      // direction. Flagged as an assumption, not a validated formula — see plan notes. ──
      const completionPct = planned > 0 ? Math.min(100, Math.round((completedThisWeek / planned) * 100)) : 0;
      const volumeTrendScore = volumeDeltaPct == null ? 50 : volumeDeltaPct >= 0 ? 70 : 30;
      const performanceScore = hasTrainingData
        ? Math.round(completionPct * 0.5 + proteinAdherencePct * 0.3 + volumeTrendScore * 0.2)
        : 0;

      // Trend: recompute completion-rate-based score for each of the last 7 days (rolling
      // 7-day completion rate as of that day) — a lightweight day-by-day echo of the same
      // completion signal, not a stored history.
      const performanceTrend: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayEnd = new Date();
        dayEnd.setDate(dayEnd.getDate() - i);
        const windowStart = new Date(dayEnd);
        windowStart.setDate(windowStart.getDate() - 6);
        const completedInWindow = workouts.filter(
          (w) => w.status !== "partial" && new Date(w.at) >= windowStart && new Date(w.at) <= dayEnd,
        ).length;
        performanceTrend.push(planned > 0 ? Math.min(100, Math.round((completedInWindow / planned) * 100)) : 0);
      }

      // ── Readiness — simple rest-gap heuristic, no wearable dependency ───
      const daysSinceLast = workouts.length > 0 ? Math.floor((Date.now() - new Date(workouts[0].at).getTime()) / 86_400_000) : 99;
      let readinessScore = 75;
      if (daysSinceLast === 0) readinessScore -= 10;
      if (daysSinceLast >= 1) readinessScore += 10;
      if (streakDays >= 4) readinessScore -= 10;
      readinessScore = Math.max(0, Math.min(100, readinessScore));
      const readinessLabel =
        readinessScore >= 80 ? "Ready to train" : readinessScore >= 60 ? "Train at normal effort" : "Consider a lighter session";

      setState({
        loading: false,
        hasTrainingData,
        performanceScore,
        performanceTrend,
        readinessScore,
        readinessLabel,
        calories: { value: Math.round(caloriesToday), target: nutrition?.calories ?? 0 },
        macros: [
          { label: "Protein", value: Math.round((proteinByDay.get(kgKey(new Date())) ?? 0)), target: nutrition?.protein_g ?? 0, unit: "g" },
          {
            label: "Carbs",
            value: Math.round(
              foodRows.filter((r) => new Date(r.at) >= startOfDay).reduce((s, r: any) => s + (r.carbs_g ?? 0), 0),
            ),
            target: nutrition?.carbs_g ?? 0,
            unit: "g",
          },
          {
            label: "Fat",
            value: Math.round(
              foodRows.filter((r) => new Date(r.at) >= startOfDay).reduce((s, r: any) => s + (r.fat_g ?? 0), 0),
            ),
            target: nutrition?.fat_g ?? 0,
            unit: "g",
          },
        ],
        muscleFrequency,
        streakDays,
        weeklyVolumeLb,
        volumeDeltaPct,
        topLifts,
        consistency: { completed: completedThisWeek, planned, pct, prevPct, days },
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { ...state, refetch };
}
