import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { canReadAppleHealth, readSleepMinutesForNight } from "../lib/appleHealth";
import {
  byMostRecentFinishedFirst,
  isUnfinishedWorkout,
  resolveTodaySession,
  type PlanSessionRow,
  type WorkoutLogRow,
} from "../lib/resolveTodaySession";
import { addDays, localDateKey, startOfLocalDay, startOfWeek } from "../lib/calendarDate";
import { titleCase } from "../lib/textFormat";

import type { FoodLogEntry } from "./useFuelData";
import { useLocalDayRollover } from "./useLocalDayRollover";
import { normalizeLoadScheme } from "../../supabase/functions/_shared/load-intent";
import {
  projectSchedule,
  resolveTrainingDays,
  type ScheduleDay,
  type ScheduleDayKind,
} from "../../supabase/functions/_shared/training-schedule";

interface PlanExerciseRow {
  ord: number;
  sets: number | null;
  rep_scheme: string | null;
  load_scheme: string | null;
  exercise: { name: string } | null;
}

interface FullPlanSession extends PlanSessionRow {
  focus: string;
  session_type?: string | null;
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
  session: { planSessionId: string; focus: string; sessionType: string; exercises: TodayExercise[] } | null;
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
  /** No active plan exists at all — distinct from a rest day, which means a plan exists and has
   *  nothing due today. Without it a brand-new user was shown "Rest Day". */
  hasPlan: boolean;
  planStartsOn: string | null;
  upcomingSession: { focus: string; sessionType: string; exercises: TodayExercise[] } | null;
  mealsLoggedToday: number;
  /** Real logged meals, not a suggested/planned concept — same source Fuel screen reads, just
   *  scoped to today so the day's Meals section shows what actually happened rather than a
   *  fabricated recommendation. */
  mealsToday: FoodLogEntry[];
  refetch: () => void;
}


const fetchPlanAndLogs = async (userId: string) => {
  // rest_day rows are always written for "today" at write time (see src/lib/restDay.ts), never
  // a future date, so a 90-day-back window covers every caller (today/week/month/day-detail)
  // without needing a per-caller date range the way logs' own query doesn't have either.
  const ninetyDaysAgo = localDateKey(new Date(Date.now() - 90 * 86_400_000));
  const [{ data: plan }, { data: logs }, { data: restDays }, { data: override }] = await Promise.all([
    supabase
      .from("training_plan")
      .select(
        "created_at, starts_on, days_per_week, training_days, plan_session(id, day_order, weekday, focus, session_type, plan_exercise(ord, sets, rep_scheme, load_scheme, exercise(name)))",
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("workout_log")
      .select("id, at, plan_session_id, status, plan_session!workout_log_plan_session_id_fkey(focus)")
      .eq("user_id", userId)
      .order("at", { ascending: false })
      .limit(30),
    supabase.from("rest_day").select("date").eq("user_id", userId).gte("date", ninetyDaysAgo),
    // Today's one-off custom session, if the coach built one. Fetched here so Calendar resolves
    // today exactly the way Home does — two screens disagreeing about what's due today is the
    // same class of bug as the coach disagreeing with the screen.
    supabase
      .from("day_override")
      .select(
        "plan_session(id, day_order, weekday, focus, session_type, plan_exercise(ord, sets, rep_scheme, load_scheme, exercise(name)))",
      )
      .eq("user_id", userId)
      .eq("date", localDateKey(new Date()))
      .maybeSingle(),
  ]);
  const overrideRow = (override as any)?.plan_session ?? null;
  const sessions = (plan?.plan_session ?? []) as unknown as FullPlanSession[];
  const planCreatedKey = plan?.created_at ? localDateKey(new Date(plan.created_at)) : null;
  const startsOnKey = (plan?.starts_on as string | null) ?? null;
  return {
    trainingDays: resolveTrainingDays(plan as any, sessions),
    activeFromKey: [planCreatedKey, startsOnKey].filter((k): k is string => !!k).sort().pop() ?? null,
    sessions,
    logs: (logs ?? []) as WorkoutLogRow[],
    restDayDates: new Set(((restDays ?? []) as any[]).map((r) => r.date as string)),
    dayOverride: ((Array.isArray(overrideRow) ? overrideRow[0] : overrideRow) ??
      null) as FullPlanSession | null,
    startsOnKey,
  };
};

type PlanAndLogs = Awaited<ReturnType<typeof fetchPlanAndLogs>>;

const scheduleFor = (
  data: PlanAndLogs,
  fromKey: string,
  toKey: string,
  extraLogs: WorkoutLogRow[] = [],
): ScheduleDay<FullPlanSession>[] => {
  const seen = new Set<string>();
  const logs = [...data.logs, ...extraLogs].filter((row) => {
    const key = row.id ?? `${row.at}:${row.plan_session_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const todayDue = resolveTodaySession(
    data.sessions,
    data.logs,
    new Date(),
    data.restDayDates,
    data.dayOverride,
    data.startsOnKey,
    data.trainingDays,
  );
  return projectSchedule({
    sessions: data.sessions,
    trainingDays: data.trainingDays,
    logs: logs.map((row) => ({ ...row, dateKey: localDateKey(new Date(row.at)) })),
    restDayDates: data.restDayDates,
    activeFromKey: data.activeFromKey,
    todayKey: localDateKey(new Date()),
    todayDue,
    todayOverride: data.dayOverride,
    fromKey,
    toKey,
    extraSessions: data.dayOverride ? [data.dayOverride] : [],
  });
};

const focusOfDay = (day: ScheduleDay<FullPlanSession>): string | null => {
  if (day.session?.focus) return day.session.focus;
  const joined = (day.log as any)?.plan_session;
  return (Array.isArray(joined) ? joined[0]?.focus : joined?.focus) ?? null;
};

export const useTodayCalendar = (): TodayCalendarData => {
  const [state, setState] = useState<Omit<TodayCalendarData, "refetch">>({
    loading: true,
    session: null,
    isRestDay: false,
    hasPlan: false,
    isChosenRestDay: false,
    completedToday: false,
    completedWorkout: null,
    planStartsOn: null,
    upcomingSession: null,
    mealsLoggedToday: 0,
    mealsToday: [],
  });
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  // Same local-day boundary as Home — the Today tab is entirely "what's due / done today".
  useLocalDayRollover(refetch);

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

      const [{ sessions, logs, restDayDates, dayOverride, startsOnKey, trainingDays }, foodRes] = await Promise.all([
        fetchPlanAndLogs(userId),
        supabase
          .from("food_log")
          .select("id, description, calories, protein_g, carbs_g, fat_g, at")
          .eq("user_id", userId)
          .gte("at", startOfDay.toISOString())
          .order("at", { ascending: true }),
      ]);
      if (cancelled) return;

      const today = resolveTodaySession(sessions, logs, new Date(), restDayDates, dayOverride, startsOnKey, trainingDays);
      const todayKey = localDateKey(new Date());
      const isChosenRestDay = restDayDates.has(todayKey);
      const isBeforeStart = !!startsOnKey && todayKey < startsOnKey;
      const upcoming = isBeforeStart && startsOnKey ? resolveTodaySession(sessions, [], startOfLocalDay(startsOnKey)) : null;
      // Found independent of `today`/resolveTodaySession on purpose: for a flexible rotation,
      // resolveTodaySession deliberately returns null once today's slot is already completed
      // (correct — nothing further is due), so completion can't be read off `today.id` the way
      // the old completedToday check assumed; it needs its own direct "what got logged today"
      // lookup instead. This also fixes a pinned-weekday plan, which resolveTodaySession returns
      // regardless of completion — without this, a pinned session already done today looked
      // identical to one not yet started.
      const completedLog = logs
        .slice()
        .sort(byMostRecentFinishedFirst)
        .find((log) => !isUnfinishedWorkout(log.status) && localDateKey(new Date(log.at)) === todayKey);
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
                sessionType: today.session_type ?? "strength",
                exercises: (today.plan_exercise ?? [])
                  .slice()
                  .sort((a, b) => a.ord - b.ord)
                  .map((e) => ({ name: e.exercise?.name ?? "", sets: e.sets, repScheme: e.rep_scheme, loadScheme: normalizeLoadScheme(e.load_scheme) })),
              }
            : null,
        isRestDay: !today && !completedLog,
        hasPlan: sessions.length > 0,
        isChosenRestDay,
        completedToday: !!completedLog,
        completedWorkout: completedLog?.id
          ? { workoutLogId: completedLog.id, focus: completedSession?.focus ?? null }
          : null,
        planStartsOn: isBeforeStart ? startsOnKey : null,
        upcomingSession: upcoming
          ? {
              focus: upcoming.focus,
              sessionType: upcoming.session_type ?? "strength",
              exercises: (upcoming.plan_exercise ?? [])
                .slice()
                .sort((a, b) => a.ord - b.ord)
                .map((e) => ({ name: e.exercise?.name ?? "", sets: e.sets, repScheme: e.rep_scheme, loadScheme: normalizeLoadScheme(e.load_scheme) })),
            }
          : null,
        mealsLoggedToday: foodRes.data?.length ?? 0,
        mealsToday: (foodRes.data ?? []).map((row: any) => ({
          id: row.id,
          description: row.description,
          calories: row.calories ?? 0,
          proteinG: row.protein_g ?? 0,
          carbsG: row.carbs_g ?? 0,
          fatG: row.fat_g ?? 0,
          at: row.at,
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { ...state, refetch };
};

export interface WeekDay {
  date: Date;
  dateKey: string;
  weekdayLabel: string;
  focus: string | null;
  isPinnedRest: boolean;
  status: "completed" | "partial" | "missed" | "upcoming" | "rest";
  /** Real logged meal count for the day — no sleep-hours companion (the reference shows
   *  "N meals · Xh sleep"), since that would need a per-day historical HealthKit query, more
   *  work than this pass covers; a real meal count alone beats a fabricated sleep figure. */
  mealsCount: number;
}

export interface WeekCalendarData {
  loading: boolean;
  days: WeekDay[];
  refetch: () => void;
}

const WEEKDAY_LABELS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export const useWeekCalendar = (weekStart: Date): WeekCalendarData => {
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<WeekDay[]>([]);
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  // Same local-day boundary as Home — the Today tab is entirely "what's due / done today".
  useLocalDayRollover(refetch);
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

      const start = startOfLocalDay(weekStartKey);
      const end = addDays(start, 7);
      const [data, workoutRes, foodRes] = await Promise.all([
        fetchPlanAndLogs(userId),
        supabase
          .from("workout_log")
          .select("id, at, plan_session_id, status, plan_session!workout_log_plan_session_id_fkey(focus)")
          .eq("user_id", userId)
          .gte("at", start.toISOString())
          .lt("at", end.toISOString()),
        supabase
          .from("food_log")
          .select("at")
          .eq("user_id", userId)
          .gte("at", start.toISOString())
          .lt("at", end.toISOString()),
      ]);
      if (cancelled) return;

      const mealsCountByDate = new Map<string, number>();
      for (const row of foodRes.data ?? []) {
        const key = localDateKey(new Date((row as { at: string }).at));
        mealsCountByDate.set(key, (mealsCountByDate.get(key) ?? 0) + 1);
      }

      const result: WeekDay[] = scheduleFor(
        data,
        weekStartKey,
        localDateKey(addDays(start, 6)),
        (workoutRes.data ?? []) as WorkoutLogRow[],
      ).map((day) => ({
        date: startOfLocalDay(day.dateKey),
        dateKey: day.dateKey,
        weekdayLabel: WEEKDAY_LABELS[day.weekday],
        focus: focusOfDay(day),
        isPinnedRest: day.kind === "rest",
        status: day.status === "due" ? "upcoming" : day.status,
        mealsCount: mealsCountByDate.get(day.dateKey) ?? 0,
      }));

      setDays(result);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStartKey, refetchSignal]);

  return { loading, days, refetch };
};

export interface MonthCalendarData {
  loading: boolean;
  completedDates: Set<string>;
  partialDates: Set<string>;
  plannedDates: Set<string>;
  refetch: () => void;
}

export const useMonthCalendar = (monthDate: Date): MonthCalendarData => {
  const [loading, setLoading] = useState(true);
  const [completedDates, setCompletedDates] = useState<Set<string>>(new Set());
  const [partialDates, setPartialDates] = useState<Set<string>>(new Set());
  const [plannedDates, setPlannedDates] = useState<Set<string>>(new Set());
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  // Same local-day boundary as Home — the Today tab is entirely "what's due / done today".
  useLocalDayRollover(refetch);
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
      const [plan, { data }] = await Promise.all([
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
        if (isUnfinishedWorkout(row.status)) partial.add(key);
        else completed.add(key);
      }

      const planned = new Set<string>();
      for (const day of scheduleFor(plan, localDateKey(start), localDateKey(addDays(end, -1)))) {
        if (day.kind === "training" || day.kind === "custom") planned.add(day.dateKey);
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
};

export interface DayDetailWorkout {
  workoutLogId: string;
  status: string;
  source: "mustle" | "independent";
  focus: string | null;
  sessionType: string;
  exercisesDone: { name: string; sets: number; reps: string; load: string }[];
  durationSec: number | null;
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
  /** Hours asleep for the night ending on this day. Apple Health when connected, otherwise the
   *  self-reported figure from a check-in — the coach can record one via log_checkin, and until
   *  now nothing in the app ever showed it back, so a user could tell the coach they slept seven
   *  hours and find no trace of it anywhere. */
  sleepHours: number | null;
  sleepSource: "health" | "checkin" | null;
  workouts: DayDetailWorkout[];
  meals: { description: string; calories: number }[];
  injuryNotes: { id: string; summary: string }[];
  macros: DayDetailMacros | null;
  plannedFocus: string | null;
  plannedSessionId: string | null;
  plannedSummary: { exercises: number; sets: number; sessionType: string } | null;
  dayKind: ScheduleDayKind | null;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
  refetch: () => void;
}

const EMPTY_DAY_DETAIL: Omit<DayDetail, "isPast" | "isToday" | "isFuture" | "refetch"> = {
  loading: true,
  sleepHours: null,
  sleepSource: null,
  workouts: [],
  meals: [],
  injuryNotes: [],
  macros: null,
  plannedFocus: null,
  plannedSessionId: null,
  plannedSummary: null,
  dayKind: null,
};

export const useDayDetail = (dateKey: string | null): DayDetail => {
  const [state, setState] = useState<Omit<DayDetail, "isPast" | "isToday" | "isFuture" | "refetch">>(
    EMPTY_DAY_DETAIL,
  );
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  // Same local-day boundary as Home — the Today tab is entirely "what's due / done today".
  useLocalDayRollover(refetch);

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

      const start = startOfLocalDay(dateKey);
      const end = addDays(start, 1);

      const [
        plan,
        { data: workouts },
        { data: food },
        { data: injuries },
        { data: nutritionTarget },
        { data: checkin },
      ] = await Promise.all([
          fetchPlanAndLogs(userId),
          supabase
            .from("workout_log")
            .select("id, at, status, source, session_type, duration_sec, exercises_done, plan_session_id, plan_session!workout_log_plan_session_id_fkey(focus)")
            .eq("user_id", userId)
            .gte("at", start.toISOString())
            .lt("at", end.toISOString())
            .order("at", { ascending: false }),
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
          supabase
            .from("checkin_log")
            .select("sleep_hours, at")
            .eq("user_id", userId)
            .gte("at", start.toISOString())
            .lt("at", end.toISOString())
            .order("at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

      // Apple Health first when it is connected, since a measured night beats a remembered one.
      // The check-in figure is the fallback, and is the only source at all for anyone who has not
      // connected Health — which, until the permission fix, was most people.
      const healthSleepMinutes = (await canReadAppleHealth())
        ? await readSleepMinutesForNight(dateKey)
        : null;
      const checkinSleepHours = (checkin as { sleep_hours: number | null } | null)?.sleep_hours ?? null;
      const sleepHours =
        healthSleepMinutes != null
          ? Math.round((healthSleepMinutes / 60) * 10) / 10
          : checkinSleepHours != null
            ? Math.round(checkinSleepHours * 10) / 10
            : null;
      const sleepSource: DayDetail["sleepSource"] =
        healthSleepMinutes != null ? "health" : checkinSleepHours != null ? "checkin" : null;
      if (cancelled) return;

      const [scheduled] = scheduleFor(plan, dateKey, dateKey, (workouts ?? []) as WorkoutLogRow[]);
      const plannedFocus = scheduled?.session?.focus ?? null;
      const plannedSessionId = scheduled?.session?.id ?? null;
      const dayKind = scheduled?.kind ?? null;
      const plannedExercises = scheduled?.session?.plan_exercise ?? [];
      const plannedSummary = scheduled?.session
        ? {
            exercises: plannedExercises.length,
            sets: plannedExercises.reduce((sum, e) => sum + (e.sets ?? 0), 0),
            sessionType: scheduled.session.session_type ?? "strength",
          }
        : null;

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
        sleepHours,
        sleepSource,
        workouts: (workouts ?? [])
          .slice()
          .sort((a: any, b: any) => {
            const byFinished = Number(isUnfinishedWorkout(a.status)) - Number(isUnfinishedWorkout(b.status));
            if (byFinished !== 0) return byFinished;
            return new Date(b.at).getTime() - new Date(a.at).getTime();
          })
          .map((w: any) => ({
          workoutLogId: w.id,
          status: w.status,
          source: w.source === "independent" ? "independent" : "mustle",
          focus: w.plan_session?.focus ?? null,
          sessionType: w.session_type ?? "strength",
          exercisesDone: w.exercises_done ?? [],
          durationSec: w.duration_sec ?? null,
        })),
        meals: (food ?? []).map((f: any) => ({ description: f.description, calories: f.calories ?? 0 })),
        injuryNotes: (injuries ?? []).map((row: any) => ({
          id: row.id,
          summary: row.note ? `${titleCase(row.area)} — ${row.note}` : `${titleCase(row.area)} flagged`,
        })),
        macros,
        plannedFocus,
        plannedSessionId,
        plannedSummary,
        dayKind,
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
};

export { WEEKDAY_LABELS };
export { startOfWeek };
