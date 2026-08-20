import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { callBrain, COACH_UNREACHABLE_MESSAGE } from "../lib/brain";
import { DEFAULT_REST_SEC, suggestRestSeconds } from "../lib/restSuggestion";
import { useProfileName } from "../hooks/useProfileName";

const EXTEND_REST_SEC = 10;

export interface SessionExercise {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  repScheme: string;
  // Real Postgres null for any exercise the brain didn't set a load scheme for — it's only
  // required for the exerciseSchema's `name`/`sets`/`rep_scheme`, not `load_scheme` (see
  // supabase/functions/_shared/brain-tools.ts). Was typed as non-nullable `string`, which is
  // exactly why nothing null-guarded it before interpolating it into template strings.
  loadScheme: string | null;
}

export interface LoggedSet {
  weight: number | null;
  reps: number;
}

export type SessionStatus = "completed" | "partial";

/** What a session run is. Cardio carries no exercise list — v1 cardio is a timer and a
 *  label, matching the design's explicit scope. */
export type SessionTarget =
  | { type: "strength"; planSessionId: string; switchedFromSessionId?: string }
  | { type: "cardio"; activity: string; switchedFromSessionId?: string };

interface PlanExerciseRow {
  id: string;
  ord: number;
  sets: number;
  rep_scheme: string;
  load_scheme: string;
  exercise_id: string;
  exercise: { name: string } | { name: string }[] | null;
}

function exerciseName(row: PlanExerciseRow): string {
  const exercise = Array.isArray(row.exercise) ? row.exercise[0] : row.exercise;
  return exercise?.name ?? "Exercise";
}

interface ActiveSessionValue {
  userId: string | null;
  userName: string | null;
  target: SessionTarget | null;
  running: boolean;
  loading: boolean;
  error: string | null;
  focus: string | null;
  exercises: SessionExercise[];
  currentExerciseIndex: number;
  currentExercise: SessionExercise | null;
  loggedSets: LoggedSet[][];
  resting: boolean;
  restKey: number;
  /** The suggested duration for the current/last rest period — a fixed target, not a live
   *  countdown. Drives the "REST TARGET" stat and the progress bar's 100% mark. */
  restTargetSec: number;
  /** Wall-clock timestamp the current rest period ends at, or null when not actively counting
   *  down (not resting, or paused). Shared so every reader (the full panel, the minimized
   *  pill) derives the same live number — see useRestRemaining. */
  restEndAt: number | null;
  /** Set while paused, to a frozen remaining-seconds value; null while actively ticking. */
  restPausedRemainingSec: number | null;
  extendRest: () => void;
  toggleRestPause: () => void;
  ended: boolean;
  /** Which kind of run it was, set by whatever ended it. Null until then. */
  endedStatus: SessionStatus | null;
  /** The workout_log row this run wrote, once it has. Null until the first set (or endSession)
   *  persists — that's what the Session Report screen is keyed on. */
  workoutLogId: string | null;
  saving: boolean;
  hasLoggedAnySet: boolean;
  coachMessage: string;
  coachThinking: boolean;
  elapsedSec: number;
  paused: boolean;
  minimized: boolean;
  start: (target: SessionTarget) => void;
  minimize: () => void;
  restore: () => void;
  logSet: (weight: number | null, reps: number) => void;
  skipExercise: () => void;
  removeQueuedExercise: (exerciseRowId: string) => void;
  swapQueuedExercise: (exerciseRowId: string, replacement: { id: string; name: string }) => void;
  finishRest: () => void;
  endSession: (status: SessionStatus) => Promise<void>;
  submitFeedback: (note: string, tags: string[]) => Promise<void>;
  askCoach: (text: string) => Promise<void>;
  noteSetLogged: (summary: string) => void;
  announce: (text: string) => void;
  setPaused: (paused: boolean) => void;
  clear: () => void;
}

const ActiveSessionCtx = createContext<ActiveSessionValue | null>(null);

export function useActiveSessionContext(): ActiveSessionValue {
  const ctx = useContext(ActiveSessionCtx);
  if (!ctx)
    throw new Error(
      "useActiveSessionContext must be used inside ActiveSessionProvider",
    );
  return ctx;
}

export function ActiveSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<SessionTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [exercises, setExercises] = useState<SessionExercise[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [loggedSets, setLoggedSets] = useState<LoggedSet[][]>([]);
  const [resting, setResting] = useState(false);
  const [restKey, setRestKey] = useState(0);
  const [restTargetSec, setRestTargetSec] = useState(DEFAULT_REST_SEC);
  const [restEndAt, setRestEndAt] = useState<number | null>(null);
  const [restPausedRemainingSec, setRestPausedRemainingSec] = useState<
    number | null
  >(null);
  const [ended, setEnded] = useState(false);
  const [endedStatus, setEndedStatus] = useState<SessionStatus | null>(null);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coachMessage, setCoachMessage] = useState("Ready when you are.");
  const [coachThinking, setCoachThinking] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [paused, setPaused] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const userName = useProfileName(userId);

  const userIdRef = useRef<string | null>(null);
  const logIdRef = useRef<string | null>(null);

  const start = useCallback((next: SessionTarget) => {
    setTarget(next);
    setLoading(next.type === "strength");
    setError(null);
    setFocus(next.type === "cardio" ? next.activity : null);
    setExercises([]);
    setCurrentExerciseIndex(0);
    setLoggedSets([]);
    setResting(false);
    setRestTargetSec(DEFAULT_REST_SEC);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);
    setEnded(false);
    setEndedStatus(null);
    setCoachMessage("Ready when you are.");
    setElapsedSec(0);
    setPaused(false);
    setMinimized(false);
    logIdRef.current = null;
    setWorkoutLogId(null);
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);

  // Resolved once, independent of any running session: the voice agent needs the user's id
  // to attribute the conversation, and useProfileName (shared with Home) fills their name for
  // the agent's prompt template without a second independent fetch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const id = session?.user.id ?? null;
      if (cancelled) return;

      userIdRef.current = id;
      setUserId(id);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const clear = useCallback(() => {
    setTarget(null);
    setEnded(false);
    setEndedStatus(null);
    setExercises([]);
    setLoggedSets([]);
    setElapsedSec(0);
    setMinimized(false);
    setResting(false);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);
    logIdRef.current = null;
    setWorkoutLogId(null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      userIdRef.current = session?.user.id ?? null;

      if (!target || target.type !== "strength") return;
      if (!userIdRef.current) {
        if (!cancelled) {
          setError("Not signed in");
          setLoading(false);
        }
        return;
      }

      const { data, error: fetchError } = await supabase
        .from("plan_session")
        .select(
          "id, focus, plan_exercise(id, ord, sets, rep_scheme, load_scheme, exercise_id, exercise:exercise_id(name))",
        )
        .eq("id", target.planSessionId)
        .eq("user_id", userIdRef.current)
        .maybeSingle();

      if (cancelled) return;

      if (fetchError || !data) {
        setError(fetchError?.message ?? "Session not found");
        setLoading(false);
        return;
      }

      const rows = ((data.plan_exercise ?? []) as PlanExerciseRow[])
        .slice()
        .sort((a, b) => a.ord - b.ord);
      const detail: SessionExercise[] = rows.map((row) => ({
        id: row.id,
        exerciseId: row.exercise_id,
        name: exerciseName(row),
        sets: row.sets,
        repScheme: row.rep_scheme,
        loadScheme: row.load_scheme,
      }));

      setFocus(data.focus ?? null);
      setExercises(detail);
      setLoggedSets(detail.map(() => []));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [target]);

  // Cardio is timed work, so the session itself is the clock. Strength sessions track
  // elapsed time too — it's what the log's duration_sec records either way.
  useEffect(() => {
    if (!target || ended || paused) return;
    const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [target, ended, paused]);

  const writeWorkoutLog = useCallback(
    async (sets: LoggedSet[][], status: SessionStatus) => {
      const userId = userIdRef.current;
      if (!userId || !target) return;

      const isCardio = target.type === "cardio";

      const exercisesDone = exercises
        .map((exercise, i) => ({ exercise, sets: sets[i] ?? [] }))
        .filter(({ sets: s }) => s.length > 0)
        .map(({ exercise, sets: s }) => ({
          name: exercise.name,
          sets: s.length,
          reps: s.map((set) => set.reps).join(","),
          load: s.every((set) => set.weight == null)
            ? "bodyweight"
            : s.map((set) => set.weight ?? "-").join(","),
        }));

      if (!isCardio && exercisesDone.length === 0) return;

      setSaving(true);
      const { data, error: insertError } = await supabase
        .from("workout_log")
        .insert({
          user_id: userId,
          plan_session_id:
            target.type === "strength" ? target.planSessionId : null,
          switched_from_session_id: target.switchedFromSessionId ?? null,
          session_type: isCardio ? "cardio" : "strength",
          cardio_activity: isCardio ? target.activity : null,
          duration_sec: elapsedSec,
          exercises_done: exercisesDone,
          status,
          note: null,
        })
        .select("id")
        .maybeSingle();
      setSaving(false);

      if (insertError) {
        console.error(
          "[active session] failed to log workout:",
          insertError.message,
        );
        return;
      }
      logIdRef.current = data?.id ?? null;
      setWorkoutLogId(data?.id ?? null);
    },
    [exercises, target, elapsedSec],
  );

  const logSet = useCallback(
    (weight: number | null, reps: number) => {
      const exercise = exercises[currentExerciseIndex];
      if (!exercise) return;

      const next = loggedSets.map((sets) => sets.slice());
      next[currentExerciseIndex] = [
        ...next[currentExerciseIndex],
        { weight, reps },
      ];
      setLoggedSets(next);

      const setsSoFar = next[currentExerciseIndex].length;
      if (setsSoFar < exercise.sets) {
        const seconds = suggestRestSeconds(
          reps,
          exercise.repScheme,
          setsSoFar,
          exercise.sets,
        );
        setRestTargetSec(seconds);
        setRestEndAt(Date.now() + seconds * 1000);
        setRestPausedRemainingSec(null);
        setResting(true);
        setRestKey((k) => k + 1);
      } else if (currentExerciseIndex === exercises.length - 1) {
        setEnded(true);
        setEndedStatus("completed");
        void writeWorkoutLog(next, "completed");
      } else {
        setCurrentExerciseIndex((i) => i + 1);
      }
    },
    [currentExerciseIndex, exercises, loggedSets, writeWorkoutLog],
  );

  const skipExercise = useCallback(() => {
    setResting(false);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);

    if (currentExerciseIndex === exercises.length - 1) {
      const status: SessionStatus = loggedSets.some((sets) => sets.length > 0) ? "completed" : "partial";
      setEnded(true);
      setEndedStatus(status);
      void writeWorkoutLog(loggedSets, status);
    } else {
      setCurrentExerciseIndex((i) => i + 1);
    }
  }, [currentExerciseIndex, exercises.length, loggedSets, writeWorkoutLog]);

  const removeQueuedExercise = useCallback(
    (exerciseRowId: string) => {
      const index = exercises.findIndex((e) => e.id === exerciseRowId);
      if (index === -1 || index <= currentExerciseIndex) return;
      setExercises((prev) => prev.filter((e) => e.id !== exerciseRowId));
      setLoggedSets((prev) => prev.filter((_, i) => i !== index));
    },
    [exercises, currentExerciseIndex],
  );

  const swapQueuedExercise = useCallback(
    (exerciseRowId: string, replacement: { id: string; name: string }) => {
      const index = exercises.findIndex((e) => e.id === exerciseRowId);
      if (index === -1 || index <= currentExerciseIndex) return;
      setExercises((prev) =>
        prev.map((e) => (e.id === exerciseRowId ? { ...e, exerciseId: replacement.id, name: replacement.name } : e)),
      );
    },
    [exercises, currentExerciseIndex],
  );

  const finishRest = useCallback(() => {
    setResting(false);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);
  }, []);

  const extendRest = useCallback(() => {
    setRestTargetSec((sec) => sec + EXTEND_REST_SEC);
    setRestEndAt((endAt) =>
      endAt === null ? endAt : endAt + EXTEND_REST_SEC * 1000,
    );
    setRestPausedRemainingSec((remaining) =>
      remaining === null ? remaining : remaining + EXTEND_REST_SEC,
    );
  }, []);

  const toggleRestPause = useCallback(() => {
    if (restPausedRemainingSec !== null) {
      // Resuming: hand the frozen remainder back to the live wall-clock timer.
      setRestEndAt(Date.now() + restPausedRemainingSec * 1000);
      setRestPausedRemainingSec(null);
      return;
    }
    if (restEndAt === null) return; // not actively resting — nothing to pause
    setRestPausedRemainingSec(
      Math.max(0, Math.round((restEndAt - Date.now()) / 1000)),
    );
    setRestEndAt(null);
  }, [restEndAt, restPausedRemainingSec]);

  const endSession = useCallback(
    async (status: SessionStatus) => {
      setEnded(true);
      setEndedStatus(status);
      await writeWorkoutLog(loggedSets, status);
    },
    [loggedSets, writeWorkoutLog],
  );

  const submitFeedback = useCallback(async (note: string, tags: string[]) => {
    const logId = logIdRef.current;
    if (!logId) return;
    const { error: updateError } = await supabase
      .from("workout_log")
      .update({
        note: note.trim() || null,
        feedback_tags: tags.length > 0 ? tags : null,
      })
      .eq("id", logId);
    if (updateError)
      console.error(
        "[active session] failed to save feedback:",
        updateError.message,
      );
  }, []);

  // Coach Q&A mid-session — same real brain the Home chat uses. The reply is also filed
  // against the current exercise so the Guide sheet's notes are real conversation
  // history rather than authored content.
  const latestAskRef = useRef(0);
  const askCoach = useCallback(
    async (text: string) => {
      const userId = userIdRef.current;
      if (!userId || !text.trim()) return;
      const requestId = ++latestAskRef.current;
      setCoachThinking(true);
      try {
        const result = await callBrain(userId, text.trim());
        if (latestAskRef.current !== requestId) return;
        setCoachMessage(result.reply);

        const exercise = exercises[currentExerciseIndex];
        if (exercise && result.reply.trim()) {
          const { error: noteError } = await supabase
            .from("exercise_note")
            .insert({
              user_id: userId,
              exercise_id: exercise.exerciseId,
              note: result.reply.trim(),
            });
          if (noteError)
            console.error(
              "[active session] failed to save note:",
              noteError.message,
            );
        }
      } catch (err) {
        console.error("[active session] coach call failed:", err);
        if (latestAskRef.current !== requestId) return;
        setCoachMessage(COACH_UNREACHABLE_MESSAGE);
      } finally {
        if (latestAskRef.current === requestId) setCoachThinking(false);
      }
    },
    [currentExerciseIndex, exercises],
  );

  const announce = useCallback((text: string) => {
    setCoachMessage(text);
  }, []);

  const noteSetLogged = useCallback(
    (summary: string) => {
      announce(`Logged — ${summary}.`);
    },
    [announce],
  );

  const value = useMemo<ActiveSessionValue>(
    () => ({
      userId,
      userName,
      target,
      running: target !== null && !ended,
      loading,
      error,
      focus,
      exercises,
      currentExerciseIndex,
      currentExercise: exercises[currentExerciseIndex] ?? null,
      loggedSets,
      resting,
      restKey,
      restTargetSec,
      restEndAt,
      restPausedRemainingSec,
      ended,
      endedStatus,
      workoutLogId,
      saving,
      hasLoggedAnySet: loggedSets.some((sets) => sets.length > 0),
      coachMessage,
      coachThinking,
      elapsedSec,
      paused,
      minimized,
      start,
      minimize,
      restore,
      logSet,
      skipExercise,
      removeQueuedExercise,
      swapQueuedExercise,
      finishRest,
      endSession,
      submitFeedback,
      askCoach,
      noteSetLogged,
      announce,
      setPaused,
      clear,
      toggleRestPause,
      extendRest,
    }),
    [
      userId,
      userName,
      target,
      loading,
      error,
      focus,
      exercises,
      currentExerciseIndex,
      loggedSets,
      resting,
      restKey,
      restTargetSec,
      restEndAt,
      restPausedRemainingSec,
      ended,
      endedStatus,
      workoutLogId,
      saving,
      coachMessage,
      coachThinking,
      elapsedSec,
      paused,
      minimized,
      start,
      minimize,
      restore,
      logSet,
      skipExercise,
      removeQueuedExercise,
      swapQueuedExercise,
      finishRest,
      endSession,
      submitFeedback,
      askCoach,
      noteSetLogged,
      announce,
      clear,
      toggleRestPause,
      extendRest,
    ],
  );

  return (
    <ActiveSessionCtx.Provider value={value}>
      {children}
    </ActiveSessionCtx.Provider>
  );
}
