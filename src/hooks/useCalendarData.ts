import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { resolveTodaySession, type PlanSessionRow, type WorkoutLogRow } from "../lib/resolveTodaySession";
import { addDays, localDateKey, startOfWeek } from "../lib/calendarDate";
import { titleCase } from "../lib/textFormat";

// A flexible split's exact rest days aren't stored anywhere — only the weekly cadence
// (days_per_week) is — so this assumes the ordinary real-world reading of "N days a week":
// consecutive weekdays starting Monday, rest on whatever's left at the end of the week (e.g.
// 5/week = Mon-Fri on, Sat-Sun off). `dow` is JS's 0=Sun..6=Sat.
function isTrainingSlot(dow: number, daysPerWeek: number): boolean {
  const mondayIndex = (dow + 6) % 7; // Mon=0 .. Sun=6
  return mondayIndex < daysPerWeek;
}

interface PlanExerciseRow {
  ord: number;
  sets: number | null;
  rep_scheme: string | null;
  load_scheme: string | null;
  exercise: { name: string } | null;
}

interface FullPlanSession extends PlanSessionRow {
  focus: string;
  plan_exercise?: PlanExerciseRow[];
}

export interface TodayExercise {
  name: string;
  sets: number | null;
  repScheme: string | null;
  loadScheme: string | null;
}

export interface TodayCalendarData {
  loading: boolean;
  session: { planSessionId: string; focus: string; exercises: TodayExercise[] } | null;
  isRestDay: boolean;
  /** True only when today is a rest day because the user explicitly chose it — distinct from
   *  isRestDay, which is also true when the plan's own rotation just has nothing due. */
  isChosenRestDay: boolean;
  completedToday: boolean;
  /** The session actually completed today, if any — independent of `session`/`isRestDay`, which
   *  only describe what's still due. Without this, finishing today's only session made
   *  resolveTodaySession correctly report nothing further due, but the screen had no way to
   *  distinguish that from a genuine rest day and showed "Rest Day" right after a real workout —
   *  confirmed live. */
  completedWorkout: { workoutLogId: string; focus: string | null } | null;
  mealsLoggedToday: number;
  refetch: () => void;
}

async function fetchPlanAndLogs(userId: string) {
  // rest_day rows are always written for "today" at write time (see src/lib/restDay.ts), never
  // a future date, so a 90-day-back window covers every caller (today/week/month/day-detail)
  // without needing a per-caller date range the way logs' own query doesn't have either.
  const ninetyDaysAgo = localDateKey(new Date(Date.now() - 90 * 86_400_000));
  const [{ data: plan }, { data: logs }, { data: restDays }] = await Promise.all([
    supabase
      .from("training_plan")
      .select("plan_session(id, day_order, weekday, focus, plan_exercise(ord, sets, rep_scheme, load_scheme, exercise(name)))")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("workout_log")
      .select("id, at, plan_session_id, status")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(30),
    supabase.from("rest_day").select("date").eq("user_id", userId).gte("date", ninetyDaysAgo),
  ]);
  return {
    sessions: (plan?.plan_session ?? []) as unknown as FullPlanSession[],
    logs: (logs ?? []) as WorkoutLogRow[],
    restDayDates: new Set(((restDays ?? []) as any[]).map((r) => r.date as string)),
  };
}

export function useTodayCalendar(): TodayCalendarData {
  const [state, setState] = useState<Omit<TodayCalendarData, "refetch">>({
    loading: true,
    session: null,
    isRestDay: false,
    isChosenRestDay: false,
    completedToday: false,
    completedWorkout: null,
    mealsLoggedToday: 0,
  });
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const userId = authSession?.user.id;
      if (!userId) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ sessions, logs, restDayDates }, foodRes] = await Promise.all([
        fetchPlanAndLogs(userId),
        supabase.from("food_log").select("id").eq("user_id", userId).gte("at", startOfDay.toISOString()),
      ]);
      if (cancelled) return;

      const today = resolveTodaySession(sessions, logs, new Date(), restDayDates);
      const todayKey = localDateKey(new Date());
      const isChosenRestDay = restDayDates.has(todayKey);
      // Found independent of `today`/resolveTodaySession on purpose: for a flexible rotation,
      // resolveTodaySession deliberately returns null once today's slot is already completed
      // (correct — nothing further is due), so completion can't be read off `today.id` the way
      // the old completedToday check assumed; it needs its own direct "what got logged today"
      // lookup instead. This also fixes a pinned-weekday plan, which resolveTodaySession returns
      // regardless of completion — without this, a pinned session already done today looked
      // identical to one not yet started.
      const completedLog = logs
        .slice()
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .find((log) => log.status !== "partial" && localDateKey(new Date(log.at)) === todayKey);
      const completedSession = completedLog?.plan_session_id
        ? sessions.find((s) => s.id === completedLog.plan_session_id)
        : undefined;

      setState({
        loading: false,
        session:
          today && !completedLog
            ? {
                planSessionId: today.id,
                focus: today.focus,
                exercises: (today.plan_exercise ?? [])
                  .slice()
                  .sort((a, b) => a.ord - b.ord)
                  .map((e) => ({ name: e.exercise?.name ?? "", sets: e.sets, repScheme: e.rep_scheme, loadScheme: e.load_scheme })),
              }
            : null,
        isRestDay: !today && !completedLog,
        isChosenRestDay,
        completedToday: !!completedLog,
        completedWorkout: completedLog?.id
          ? { workoutLogId: completedLog.id, focus: completedSession?.focus ?? null }
          : null,
        mealsLoggedToday: foodRes.data?.length ?? 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { ...state, refetch };
}

export interface WeekDay {
  date: Date;
  dateKey: string;
  weekdayLabel: string;
  focus: string | null;
  isPinnedRest: boolean;
  status: "completed" | "partial" | "missed" | "upcoming" | "rest";
}

export interface WeekCalendarData {
  loading: boolean;
  days: WeekDay[];
  refetch: () => void;
}

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function useWeekCalendar(weekStart: Date): WeekCalendarData {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<WeekDay[]>([]);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  const weekStartKey = localDateKey(weekStart);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const userId = authSession?.user.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const start = new Date(`${weekStartKey}T00:00:00`);
      const end = addDays(start, 7);
      const [{ sessions, logs: allRecentLogs, restDayDates }, workoutRes] = await Promise.all([
        fetchPlanAndLogs(userId),
        supabase
          .from("workout_log")
          .select("at, plan_session_id, status")
          .eq("user_id", userId)
          .gte("at", start.toISOString())
          .lt("at", end.toISOString()),
      ]);
      if (cancelled) return;

      const pinnedByWeekday = new Map(sessions.filter((s) => s.weekday !== null).map((s) => [s.weekday as number, s]));
      const isFlexible = sessions.length > 0 && sessions.every((s) => s.weekday === null);
      const workouts = (workoutRes.data ?? []) as WorkoutLogRow[];
      const todayKey = localDateKey(new Date());
      const todayDate = new Date(`${todayKey}T00:00:00`);

      const rotation = sessions.slice().sort((a, b) => a.day_order - b.day_order);
      const dueToday = resolveTodaySession(sessions, allRecentLogs, new Date(), restDayDates);

      const daysPerWeek = rotation.length;

      // Index of the next session due once today's (real, resolved) slot is spoken for —
      // same "last logged, advance by one" read resolveTodaySession itself uses internally,
      // needed here because projecting day 2+ ahead requires a rotation position even on the
      // days resolveTodaySession answers "null" for (already trained today, or a rest slot).
      let pointerIndex = 0;
      if (isFlexible && rotation.length > 0) {
        const inPlan = new Set(rotation.map((s) => s.id));
        const lastLogged = allRecentLogs
          .slice()
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .find((log) => log.plan_session_id && inPlan.has(log.plan_session_id));
        if (lastLogged) {
          const lastIndex = rotation.findIndex((s) => s.id === lastLogged.plan_session_id);
          pointerIndex =
            lastIndex === -1 ? 0 : lastLogged.status === "partial" ? lastIndex : (lastIndex + 1) % rotation.length;
        }
      }

      const result: WeekDay[] = [];
      for (let i = 0; i < 7; i++) {
        const date = addDays(start, i);
        const dateKey = localDateKey(date);
        const isToday = dateKey === todayKey;
        const isFuture = dateKey > todayKey;
        const workoutThatDay = workouts.find((w) => localDateKey(new Date(w.at)) === dateKey);
        const pinned = pinnedByWeekday.get(i);
        const isPinnedRest = sessions.length > 0 && !isFlexible && !pinned;

        // Same evenly-spaced rotation projection whichever direction from today — a past
        // training-slot day needs a "was this completed?" read too, not just future ones.
        let projectedFocus: string | null = null;
        if (isFlexible && !isToday && rotation.length > 0 && isTrainingSlot(date.getDay(), daysPerWeek)) {
          let trainingSlots = 0;
          const step = isFuture ? 1 : -1;
          const cursor = new Date(todayDate);
          while (localDateKey(cursor) !== dateKey) {
            cursor.setDate(cursor.getDate() + step);
            if (isTrainingSlot(cursor.getDay(), daysPerWeek)) trainingSlots++;
          }
          const offset = isFuture ? trainingSlots - 1 : -trainingSlots;
          const idx = ((pointerIndex + offset) % rotation.length + rotation.length) % rotation.length;
          projectedFocus = rotation[idx]?.focus ?? null;
        }

        const loggedFocus = workoutThatDay?.plan_session_id
          ? (rotation.find((s) => s.id === workoutThatDay.plan_session_id)?.focus ?? null)
          : null;
        const focus =
          loggedFocus ?? (pinned ? pinned.focus : null) ?? (isToday ? (dueToday?.focus ?? null) : null) ?? projectedFocus;

        let status: WeekDay["status"];
        if (workoutThatDay) status = workoutThatDay.status === "partial" ? "partial" : "completed";
        else if (isPinnedRest) status = "rest";
        else if (isToday && dueToday) status = "upcoming";
        else if (isFuture && projectedFocus) status = "upcoming";
        else if (isFuture) status = "rest";
        else if (projectedFocus) status = "missed";
        else if (isFlexible) status = "rest";
        else status = "missed";

        result.push({
          date,
          dateKey,
          weekdayLabel: WEEKDAY_LABELS[i],
          focus,
          isPinnedRest,
          status,
        });
      }

      setDays(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStartKey, refetchSignal]);

  return { loading, days, refetch };
}

export interface MonthCalendarData {
  loading: boolean;
  completedDates: Set<string>;
  partialDates: Set<string>;
  plannedDates: Set<string>;
  refetch: () => void;
}

export function useMonthCalendar(monthDate: Date): MonthCalendarData {
  const [loading, setLoading] = useState(true);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [partialDates, setPartialDates] = useState<Set<string>>(new Set());
  const [plannedDates, setPlannedDates] = useState<Set<string>>(new Set());
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const userId = authSession?.user.id;
      if (!userId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const start = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 21);
      const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 2, 10);
      const [{ sessions }, { data }] = await Promise.all([
        fetchPlanAndLogs(userId),
        supabase
          .from("workout_log")
          .select("at, status")
          .eq("user_id", userId)
          .gte("at", start.toISOString())
          .lt("at", end.toISOString()),
      ]);
      if (cancelled) return;

      const completed = new Set<string>();
      const partial = new Set<string>();
      for (const row of (data ?? []) as { at: string; status: string }[]) {
        const key = localDateKey(new Date(row.at));
        if (row.status === "partial") partial.add(key);
        else completed.add(key);
      }

      // Same "which calendar days are training days" read the Week tab uses — a pinned plan
      // says so directly per weekday; a flexible plan only has a weekly cadence to go on, so
      // every day in the visible range gets evenlyspaced training slots from days_per_week.
      const planned = new Set<string>();
      const isFlexible = sessions.length > 0 && sessions.every((s) => s.weekday === null);
      const pinnedWeekdays = new Set(sessions.filter((s) => s.weekday !== null).map((s) => s.weekday as number));
      const daysPerWeek = sessions.length;
      if (sessions.length > 0) {
        const cursor = new Date(start);
        while (cursor < end) {
          const dow = cursor.getDay();
          if (isFlexible ? isTrainingSlot(dow, daysPerWeek) : pinnedWeekdays.has(dow)) {
            planned.add(localDateKey(cursor));
          }
          cursor.setDate(cursor.getDate() + 1);
        }
      }

      setCompletedDates(completed);
      setPartialDates(partial);
      setPlannedDates(planned);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [monthKey, refetchSignal]);

  return { loading, completedDates, partialDates, plannedDates, refetch };
}

export interface DayDetailWorkout {
  workoutLogId: string;
  status: string;
  focus: string | null;
  exercisesDone: { name: string; sets: number; reps: string; load: string }[];
}

export interface DayDetailMacros {
  proteinG: number;
  proteinGoalG: number;
  carbsG: number;
  carbsGoalG: number;
  fatG: number;
  fatGoalG: number;
}

export interface DayDetail {
  loading: boolean;
  workouts: DayDetailWorkout[];
  meals: { description: string; calories: number }[];
  injuryNotes: { id: string; summary: string }[];
  macros: DayDetailMacros | null;
  plannedFocus: string | null;
  plannedSessionId: string | null;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
  refetch: () => void;
}

const EMPTY_DAY_DETAIL: Omit<DayDetail, "isPast" | "isToday" | "isFuture" | "refetch"> = {
  loading: true,
  workouts: [],
  meals: [],
  injuryNotes: [],
  macros: null,
  plannedFocus: null,
  plannedSessionId: null,
};

export function useDayDetail(dateKey: string | null): DayDetail {
  const [state, setState] = useState<Omit<DayDetail, "isPast" | "isToday" | "isFuture" | "refetch">>(
    EMPTY_DAY_DETAIL,
  );
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);

  useEffect(() => {
    if (!dateKey) return;
    let cancelled = false;
    (async () => {
      setState({ ...EMPTY_DAY_DETAIL, loading: true });
      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      const userId = authSession?.user.id;
      if (!userId) {
        if (!cancelled) setState({ ...EMPTY_DAY_DETAIL, loading: false });
        return;
      }

      const start = new Date(`${dateKey}T00:00:00`);
      const end = addDays(start, 1);
      const weekday = start.getDay();
      const todayKey = localDateKey(new Date());
      const isToday = dateKey === todayKey;
      const isFuture = dateKey > todayKey;

      const [
        { sessions, logs: recentLogs, restDayDates },
        { data: workouts },
        { data: food },
        { data: injuries },
        { data: nutritionTarget },
      ] = await Promise.all([
          fetchPlanAndLogs(userId),
          supabase
            .from("workout_log")
            .select("id, status, exercises_done, plan_session_id, plan_session(focus)")
            .eq("user_id", userId)
            .gte("at", start.toISOString())
            .lt("at", end.toISOString()),
          supabase
            .from("food_log")
            .select("description, calories, protein_g, carbs_g, fat_g")
            .eq("user_id", userId)
            .gte("at", start.toISOString())
            .lt("at", end.toISOString()),
          supabase
            .from("injury")
            .select("id, area, note, created_at")
            .eq("user_id", userId)
            .gte("created_at", start.toISOString())
            .lt("created_at", end.toISOString()),
          supabase.from("nutrition_target").select("protein_g, carbs_g, fat_g").eq("user_id", userId).maybeSingle(),
        ]);
      if (cancelled) return;

      // Planned focus: a pinned weekday plan says so directly; a flexible rotation only
      // knows a weekly cadence, so today resolves through the same "what's due" logic the
      // Home hero uses, and any other day (past or future) gets the same evenly-spaced
      // projection the Week/Month views use for future days — extended symmetrically
      // backward, since a past training-slot day needs a "was this completed?" read too,
      // not just future ones.
      const rotation = sessions.slice().sort((a, b) => a.day_order - b.day_order);
      const isFlexible = sessions.length > 0 && sessions.every((s) => s.weekday === null);
      const pinned = sessions.find((s) => s.weekday === weekday);
      let plannedFocus: string | null = null;
      let plannedSessionId: string | null = null;

      if (pinned) {
        plannedFocus = pinned.focus;
        plannedSessionId = pinned.id;
      } else if (isToday) {
        const due = resolveTodaySession(sessions, recentLogs, new Date(), restDayDates);
        if (due) {
          plannedFocus = due.focus;
          plannedSessionId = due.id;
        }
      } else if (isFlexible && rotation.length > 0) {
        const daysPerWeek = rotation.length;
        const lastLogged = recentLogs
          .slice()
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .find((log) => log.plan_session_id && rotation.some((s) => s.id === log.plan_session_id));
        let pointerIndex = 0;
        if (lastLogged) {
          const lastIndex = rotation.findIndex((s) => s.id === lastLogged.plan_session_id);
          pointerIndex = lastIndex === -1 ? 0 : lastLogged.status === "partial" ? lastIndex : (lastIndex + 1) % rotation.length;
        }
        const target = new Date(`${dateKey}T00:00:00`);
        if (isTrainingSlot(target.getDay(), daysPerWeek)) {
          let trainingSlots = 0;
          const step = isFuture ? 1 : -1;
          const cursor = new Date(`${todayKey}T00:00:00`);
          while (localDateKey(cursor) !== dateKey) {
            cursor.setDate(cursor.getDate() + step);
            if (isTrainingSlot(cursor.getDay(), daysPerWeek)) trainingSlots++;
          }
          // Future: the next `trainingSlots` rotation entries starting at the pointer.
          // Past: walking backward the same number of training slots from the pointer —
          // the most recent past slot is the one right before whatever's due next.
          const offset = isFuture ? trainingSlots - 1 : -trainingSlots;
          const idx = ((pointerIndex + offset) % rotation.length + rotation.length) % rotation.length;
          const projected = rotation[idx];
          plannedFocus = projected?.focus ?? null;
          plannedSessionId = projected?.id ?? null;
        }
      }

      let macros: DayDetailMacros | null = null;
      if (nutritionTarget && (food?.length ?? 0) > 0) {
        const totals = (food ?? []).reduce(
          (acc: any, f: any) => ({
            protein: acc.protein + (f.protein_g ?? 0),
            carbs: acc.carbs + (f.carbs_g ?? 0),
            fat: acc.fat + (f.fat_g ?? 0),
          }),
          { protein: 0, carbs: 0, fat: 0 },
        );
        macros = {
          proteinG: Math.round(totals.protein),
          proteinGoalG: nutritionTarget.protein_g ?? 0,
          carbsG: Math.round(totals.carbs),
          carbsGoalG: nutritionTarget.carbs_g ?? 0,
          fatG: Math.round(totals.fat),
          fatGoalG: nutritionTarget.fat_g ?? 0,
        };
      }

      setState({
        loading: false,
        workouts: (workouts ?? []).map((w: any) => ({
          workoutLogId: w.id,
          status: w.status,
          focus: w.plan_session?.focus ?? null,
          exercisesDone: w.exercises_done ?? [],
        })),
        meals: (food ?? []).map((f: any) => ({ description: f.description, calories: f.calories ?? 0 })),
        injuryNotes: (injuries ?? []).map((row: any) => ({
          id: row.id,
          summary: row.note ? `${titleCase(row.area)} — ${row.note}` : `${titleCase(row.area)} flagged`,
        })),
        macros,
        plannedFocus,
        plannedSessionId,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [dateKey, refetchSignal]);

  const todayKey = localDateKey(new Date());
  return {
    ...state,
    isPast: !!dateKey && dateKey < todayKey,
    isToday: dateKey === todayKey,
    isFuture: !!dateKey && dateKey > todayKey,
    refetch,
  };
}

export { WEEKDAY_LABELS };
export { startOfWeek };
