import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as Crypto from "expo-crypto";
import { supabase } from "../lib/supabase";
import { callBrain, COACH_UNREACHABLE_MESSAGE } from "../lib/brain";
import { DEFAULT_REST_SEC, suggestRestSeconds, type RestSuggestionReason } from "../lib/restSuggestion";
import { useProfileName } from "../hooks/useProfileName";
import { buildLiveSessionSnapshot, describeLiveSessionSnapshot } from "./liveSessionState";

// Previously a module-level counter combined with Date.now() — confirmed live: two messages
// landed with the exact same generated id ("<same millisecond>-13"). Module scope fixed the
// specific case that caused (two provider instances briefly existing at once, both on their 13th
// message), but confirmed live AGAIN later: it doesn't survive Metro Fast Refresh resetting
// module-level `let` state mid-session while React preserves the provider's own hook state across
// the same refresh — the counter restarts at 0 while old messages with low counter values are
// still mounted, and a new message can land on an id one of them already has. A real UUID has no
// state to reset in the first place, so there's nothing left for any refresh/remount scenario to
// collide on.

const EXTEND_REST_SEC = 10;
// How long an identical set report is treated as a repeat of the one just logged rather than a
// new set. Generous because logging a set immediately starts a rest period, so a real second set
// of the same load and reps cannot physically arrive inside this window.
const DUPLICATE_SET_WINDOW_MS = 10_000;

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
  /** "seconds" for a timed/isometric hold (Plank, etc.) — `reps` holds the held duration, not a
   *  rep count, in that case. Carried only through the live in-memory session: the persisted
   *  workout_log record still can't distinguish a 52-rep set from a 52-second hold (both are a
   *  bare number in the same comma-joined string), which is exactly the gap the "per-set schema"
   *  backlog item exists to close — this fix is scoped to what the user sees WHILE the session is
   *  active (the card, the thread, the spoken confirmation), not the persisted record. */
  unit?: 'seconds';
}

/** Same shape workout_log.exercises_done is written in (see writeWorkoutLog below) — passed
 *  back in to resume a partial session at its actual saved position instead of restarting at
 *  exercise 0, set 0 (confirmed live: completing two sets, ending early, and starting again
 *  silently discarded them and restarted from scratch). */
export interface ResumeExerciseEntry {
  name: string;
  sets: number;
  reps: string;
  load: string;
}

interface LastSetSnapshot {
  loggedSets: LoggedSet[][];
  currentExerciseIndex: number;
  resting: boolean;
  restKey: number;
  restTargetSec: number;
  restEndAt: number | null;
  restPausedRemainingSec: number | null;
  /** Set once the async workout_log insert this set triggered actually resolves, so undo knows
   *  whether it also needs to delete a row, not just roll back in-memory state. */
  createdWorkoutLogId: string | null;
}

function restReasonCopy(reason: RestSuggestionReason): string | null {
  switch (reason) {
    case "missed_reps":
      return "Auto-extended — short of target reps";
    case "exceeded_reps":
      return "Auto-shortened — cleared target easily";
    case "fatigue_addon":
      return "Auto-extended — later-set fatigue";
    default:
      return null;
  }
}

export interface SessionThreadMessage {
  id: string;
  role: "coach" | "user";
  text: string;
}

function parseResumeSets(entry: ResumeExerciseEntry | undefined): LoggedSet[] {
  if (!entry) return [];
  const isBodyweight = entry.load === "bodyweight";
  const loads = isBodyweight ? [] : entry.load.split(",").map((l) => {
    const n = parseFloat(l.trim());
    return Number.isFinite(n) ? n : null;
  });
  return entry.reps
    .split(",")
    .map((r) => parseInt(r.trim(), 10))
    .filter((n) => Number.isFinite(n))
    .map((reps, i) => ({ weight: isBodyweight ? null : loads[i] ?? null, reps }));
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
  /** Why the current/last rest target came out where it did (auto-extended for missed reps,
   *  etc.) — null when it's just the plain default, never auto-adjusted. */
  restReasonLabel: string | null;
  extendRest: (seconds?: number, source?: "manual" | "coach") => void;
  toggleRestPause: () => void;
  pauseRest: () => void;
  resumeRest: () => void;
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
  messages: SessionThreadMessage[];
  appendMessage: (role: "coach" | "user", text: string) => void;
  elapsedSec: number;
  /** When the current session was started, ISO. Written into live_session_state so brain-voice can
   *  scope replayed conversation to THIS workout — without it the coach reads the previous
   *  session's turns as if they were still in progress and carries its set count over. */
  startedAt: string | null;
  paused: boolean;
  minimized: boolean;
  start: (
    target: SessionTarget,
    resumeExercisesDone?: ResumeExerciseEntry[],
    preloaded?: { focus: string | null; exercises: SessionExercise[] },
  ) => void;
  minimize: () => void;
  restore: () => void;
  logSet: (weight: number | null, reps: number, unit?: 'seconds') => void;
  skipExercise: () => void;
  addSet: () => void;
  undoLastSet: () => void;
  /** Persists the outgoing session as `partial` if anything was logged — used before a switch/
   *  rest-day choice that doesn't go through start() (which already does this itself). */
  resolveOutgoingSession: () => Promise<void>;
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
  const [restReasonLabel, setRestReasonLabel] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const [endedStatus, setEndedStatus] = useState<SessionStatus | null>(null);
  const [workoutLogId, setWorkoutLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coachMessage, setCoachMessage] = useState("Ready when you are.");
  const [coachThinking, setCoachThinking] = useState(false);
  const [messages, setMessages] = useState<SessionThreadMessage[]>([]);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const userName = useProfileName(userId);

  const userIdRef = useRef<string | null>(null);
  const logIdRef = useRef<string | null>(null);
  const resumeDataRef = useRef<ResumeExerciseEntry[] | null>(null);
  // Set inside start() to the exact `target` object it just passed to setTarget when the caller
  // (Preview, which already loaded and displayed this exact plan_session's exercises for the user
  // to review) hands the same data straight through — the fetch effect below checks this by
  // reference to skip its own redundant plan_session/plan_exercise query for that target.
  // Confirmed live: without this, every "Start Session" tap re-fetched data Preview had already
  // fetched seconds earlier, adding a real network round trip before the greet cue's own guard
  // (which needs a real currentExercise) could even fire — a measurable chunk of a reported
  // 10-15s gap between landing on Active Session and hearing anything.
  const preloadedTargetRef = useRef<SessionTarget | null>(null);
  // Latest writeWorkoutLog, kept current every render (assigned right after its own declaration
  // below) — lets start() call it before resetting state without needing writeWorkoutLog defined
  // earlier in this file, and without start()'s own identity needing to depend on it.
  const writeWorkoutLogRef = useRef<((sets: LoggedSet[][], status: SessionStatus) => Promise<void>) | null>(null);
  // Guards a single workout_log row per session run — logSet's completion branch, skipExercise's
  // completion branch, and endSession must never all independently insert one for the same run.
  const workoutLogWrittenRef = useRef(false);
  // Reentrancy guard for logSet — a duplicated trigger landing in the same tick before a
  // re-render must not double-append or double-write.
  const loggingRef = useRef(false);
  // Content-level idempotency, which the reentrancy guard above cannot provide: the same set can
  // arrive twice a few hundred milliseconds apart (the voice SDK re-emitting a final transcript,
  // a spoken report racing a tapped "Set done"), by which point the guard has already released.
  // Keyed on exercise + load + reps, so a genuine repeat is only ever suppressed if it lands
  // inside the window below — and no real second set of identical load and reps happens that
  // fast, because logging one starts a rest period.
  const recentSetRef = useRef<{ key: string; at: number } | null>(null);
  const lastSetSnapshotRef = useRef<LastSetSnapshot | null>(null);

  const start = useCallback(
    (
      next: SessionTarget,
      resumeExercisesDone?: ResumeExerciseEntry[],
      preloaded?: { focus: string | null; exercises: SessionExercise[] },
    ) => {
      // Persist whatever was in progress before resetting — the outgoing session's own
      // exercises/target/elapsedSec are still what writeWorkoutLogRef's current closure holds
      // at this point, since state hasn't reset yet.
      if (target && !ended && loggedSets.some((sets) => sets.length > 0)) {
        void writeWorkoutLogRef.current?.(loggedSets, "partial");
      }
      workoutLogWrittenRef.current = false;
      loggingRef.current = false;
      lastSetSnapshotRef.current = null;
      resumeDataRef.current = resumeExercisesDone ?? null;
      setTarget(next);
      setError(null);
      // Resuming deliberately forfeits the preload fast-path: resumeDataRef is only ever consumed
      // by the fetch effect below, which the preload skips, so a resumed session would silently
      // come back with none of its already-completed sets.
      const canUsePreload = !!preloaded && next.type === "strength" && !resumeExercisesDone;
      preloadedTargetRef.current = canUsePreload ? next : null;
      setLoading(next.type === "strength" && !canUsePreload);
      setFocus(next.type === "cardio" ? next.activity : canUsePreload ? preloaded!.focus : null);
      setExercises(canUsePreload ? preloaded!.exercises : []);
      setCurrentExerciseIndex(0);
      // One slot per exercise, matching what the fetch effect does — logSet indexes straight into
      // this by exercise index, and on the preload path that effect returns early and never sizes
      // it. Left empty, logSet spread `undefined` and threw before recording anything: no set
      // logged, no rest timer, the card stuck on set 1 while the coach carried on as if it had.
      setLoggedSets(canUsePreload ? preloaded!.exercises.map(() => []) : []);
      setResting(false);
      setRestTargetSec(DEFAULT_REST_SEC);
      setRestEndAt(null);
      setRestPausedRemainingSec(null);
      setRestReasonLabel(null);
      setEnded(false);
      setEndedStatus(null);
      setCoachMessage("Ready when you are.");
      setMessages([]);
      setElapsedSec(0);
      setStartedAt(new Date().toISOString());
      setPaused(false);
      setMinimized(false);
      logIdRef.current = null;
      setWorkoutLogId(null);
    },
    [target, ended, loggedSets],
  );

  const minimize = useCallback(() => setMinimized(true), []);
  const restore = useCallback(() => setMinimized(false), []);

  const appendMessage = useCallback((role: "coach" | "user", text: string) => {
    if (!text.trim()) return;
    setMessages((prev) => [...prev, { id: Crypto.randomUUID(), role, text }]);
  }, []);

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
    const clearedUserId = userIdRef.current;
    if (clearedUserId) {
      // A session that truly ends must leave no live_session_state row behind — brain-voice
      // treats the absence of a fresh row as "no session running," which only holds if this
      // never leaves a stale one for a session that's actually over.
      void supabase.from("live_session_state").delete().eq("user_id", clearedUserId);
    }
    setTarget(null);
    setEnded(false);
    setEndedStatus(null);
    setExercises([]);
    setLoggedSets([]);
    setElapsedSec(0);
    setStartedAt(null);
    setMinimized(false);
    setResting(false);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);
    setRestReasonLabel(null);
    setMessages([]);
    workoutLogWrittenRef.current = false;
    loggingRef.current = false;
    lastSetSnapshotRef.current = null;
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
      // start() already populated exercises/focus for this exact target from Preview's own data
      // — skip re-fetching what was just fetched and shown to the user seconds ago.
      if (preloadedTargetRef.current === target) return;
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

      const resume = resumeDataRef.current;
      resumeDataRef.current = null;
      if (resume) {
        const byName = new Map(resume.map((r) => [r.name.toLowerCase(), r]));
        const resumedSets = detail.map((ex) => parseResumeSets(byName.get(ex.name.toLowerCase())));
        const firstUnfinished = detail.findIndex((ex, i) => resumedSets[i].length < ex.sets);
        setLoggedSets(resumedSets);
        setCurrentExerciseIndex(firstUnfinished === -1 ? Math.max(detail.length - 1, 0) : firstUnfinished);
      } else {
        setLoggedSets(detail.map(() => []));
      }
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
      if (!userId || !target || workoutLogWrittenRef.current) return;

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
          // Every set here came from a real logSet call in this running session — never a
          // conversational report — so it's always "tracked live," even for a run that later
          // gets reconciled after an interruption (see resolve_interrupted_workout server-side).
          tracked: "live" as const,
        }));

      if (!isCardio && exercisesDone.length === 0) return;
      workoutLogWrittenRef.current = true;

      const vsPlanned = isCardio
        ? null
        : {
            planned_exercises: exercises.length,
            completed_exercises: exercisesDone.length,
            planned_sets: exercises.reduce((sum, ex) => sum + ex.sets, 0),
            completed_sets: exercisesDone.reduce((sum, ex) => sum + ex.sets, 0),
            exercises: exercises.map((exercise, i) => ({
              name: exercise.name,
              planned_sets: exercise.sets,
              completed_sets: (sets[i] ?? []).length,
            })),
          };

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
          vs_planned: vsPlanned,
          status,
          note: null,
        })
        .select("id")
        .maybeSingle();
      setSaving(false);

      if (insertError) {
        workoutLogWrittenRef.current = false; // allow a genuine retry after a real failure
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
  writeWorkoutLogRef.current = writeWorkoutLog;

  const persistPartialIfAny = useCallback(async () => {
    if (!target || ended) return;
    if (!loggedSets.some((sets) => sets.length > 0)) return;
    await writeWorkoutLogRef.current?.(loggedSets, "partial");
  }, [target, ended, loggedSets]);

  const logSet = useCallback(
    (weight: number | null, reps: number, unit?: 'seconds') => {
      const exercise = exercises[currentExerciseIndex];
      if (!exercise || loggingRef.current) return;

      // Set-indexed so a genuine repeat of the same weight/reps (routine in straight-set
      // training, e.g. three sets of "135 for 8") isn't mistaken for the SDK re-emitting the
      // identical event — confirmed live: without the set index, reporting the same numbers
      // twice in a row silently dropped the second, real set.
      const setIndex = loggedSets[currentExerciseIndex]?.length ?? 0;
      const dedupeKey = `${exercise.id}:${setIndex}:${weight ?? 'bodyweight'}:${reps}`;
      const now = Date.now();
      const recent = recentSetRef.current;
      if (recent && recent.key === dedupeKey && now - recent.at < DUPLICATE_SET_WINDOW_MS) {
        console.warn('[session] ignored a duplicate set report:', dedupeKey);
        return;
      }
      recentSetRef.current = { key: dedupeKey, at: now };

      loggingRef.current = true;

      lastSetSnapshotRef.current = {
        loggedSets,
        currentExerciseIndex,
        resting,
        restKey,
        restTargetSec,
        restEndAt,
        restPausedRemainingSec,
        createdWorkoutLogId: null,
      };

      const next = loggedSets.map((sets) => sets.slice());
      next[currentExerciseIndex] = [
        ...(next[currentExerciseIndex] ?? []),
        { weight, reps, unit },
      ];
      setLoggedSets(next);

      const setsSoFar = next[currentExerciseIndex].length;
      if (setsSoFar < exercise.sets) {
        const suggestion = suggestRestSeconds(
          reps,
          exercise.repScheme,
          setsSoFar,
          exercise.sets,
        );
        setRestTargetSec(suggestion.seconds);
        setRestEndAt(Date.now() + suggestion.seconds * 1000);
        setRestPausedRemainingSec(null);
        setResting(true);
        setRestKey((k) => k + 1);
        setRestReasonLabel(restReasonCopy(suggestion.reason));
      } else if (currentExerciseIndex === exercises.length - 1) {
        setEnded(true);
        setEndedStatus("completed");
        void writeWorkoutLog(next, "completed").then(() => {
          if (lastSetSnapshotRef.current) lastSetSnapshotRef.current.createdWorkoutLogId = logIdRef.current;
        });
      } else {
        setCurrentExerciseIndex((i) => i + 1);
      }

      queueMicrotask(() => {
        loggingRef.current = false;
      });
    },
    [
      currentExerciseIndex,
      exercises,
      loggedSets,
      resting,
      restKey,
      restTargetSec,
      restEndAt,
      restPausedRemainingSec,
      writeWorkoutLog,
    ],
  );

  const undoLastSet = useCallback(async () => {
    const snap = lastSetSnapshotRef.current;
    if (!snap) return;
    lastSetSnapshotRef.current = null;
    if (snap.createdWorkoutLogId) {
      await supabase.from("workout_log").delete().eq("id", snap.createdWorkoutLogId);
      logIdRef.current = null;
      setWorkoutLogId(null);
      workoutLogWrittenRef.current = false; // allow the corrected next set to actually write the row
    }
    setLoggedSets(snap.loggedSets);
    setCurrentExerciseIndex(snap.currentExerciseIndex);
    setResting(snap.resting);
    setRestKey(snap.restKey);
    setRestTargetSec(snap.restTargetSec);
    setRestEndAt(snap.restEndAt);
    setRestPausedRemainingSec(snap.restPausedRemainingSec);
    setRestReasonLabel(null);
    setEnded(false);
    setEndedStatus(null);
  }, []);

  const skipExercise = useCallback(() => {
    lastSetSnapshotRef.current = null;
    setResting(false);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);
    setRestReasonLabel(null);

    if (currentExerciseIndex === exercises.length - 1) {
      const status: SessionStatus = loggedSets.some((sets) => sets.length > 0) ? "completed" : "partial";
      setEnded(true);
      setEndedStatus(status);
      void writeWorkoutLog(loggedSets, status);
    } else {
      setCurrentExerciseIndex((i) => i + 1);
    }
  }, [currentExerciseIndex, exercises.length, loggedSets, writeWorkoutLog]);

  const addSet = useCallback(() => {
    setExercises((prev) => {
      const exercise = prev[currentExerciseIndex];
      if (!exercise) return prev;
      const next = prev.slice();
      next[currentExerciseIndex] = { ...exercise, sets: exercise.sets + 1 };
      return next;
    });
  }, [currentExerciseIndex]);

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
      if (index === -1 || index < currentExerciseIndex) return;
      // The current exercise can still be swapped as long as it hasn't been started yet —
      // matches the coach's own tool description ("only works on an exercise that hasn't
      // started yet"). Only a strictly earlier or already-in-progress exercise is off-limits.
      const alreadyStarted = index === currentExerciseIndex && (loggedSets[index]?.length ?? 0) > 0;
      if (alreadyStarted) return;
      setExercises((prev) =>
        prev.map((e) => (e.id === exerciseRowId ? { ...e, exerciseId: replacement.id, name: replacement.name } : e)),
      );
    },
    [exercises, currentExerciseIndex, loggedSets],
  );

  const finishRest = useCallback(() => {
    lastSetSnapshotRef.current = null;
    setResting(false);
    setRestEndAt(null);
    setRestPausedRemainingSec(null);
    setRestReasonLabel(null);
  }, []);

  const extendRest = useCallback(
    (seconds?: number, source: "manual" | "coach" = "manual") => {
      if (!resting) return; // nothing actively resting — matches adjust_rest_timer's own "ask before calling" contract
      const amount = seconds && seconds > 0 ? Math.min(120, seconds) : EXTEND_REST_SEC;
      setRestTargetSec((sec) => sec + amount);
      setRestEndAt((endAt) => (endAt === null ? endAt : endAt + amount * 1000));
      setRestPausedRemainingSec((remaining) =>
        remaining === null ? remaining : remaining + amount,
      );
      if (source === "coach") setRestReasonLabel("Coach extended your rest");
    },
    [resting],
  );

  // Split into explicit pause/resume (not just a toggle) so a voice command like "pause the
  // timer" can act on the timer's actual current state rather than blindly flipping whatever
  // it happens to be — the coach receives that current state via the live session snapshot.
  const pauseRest = useCallback(() => {
    if (restEndAt === null) return; // not actively resting — nothing to pause
    setRestPausedRemainingSec(
      Math.max(0, Math.round((restEndAt - Date.now()) / 1000)),
    );
    setRestEndAt(null);
  }, [restEndAt]);

  const resumeRest = useCallback(() => {
    if (restPausedRemainingSec === null) return;
    setRestEndAt(Date.now() + restPausedRemainingSec * 1000);
    setRestPausedRemainingSec(null);
  }, [restPausedRemainingSec]);

  const toggleRestPause = useCallback(() => {
    if (restPausedRemainingSec !== null) {
      resumeRest();
      return;
    }
    pauseRest();
  }, [restPausedRemainingSec, pauseRest, resumeRest]);

  const endSession = useCallback(
    async (status: SessionStatus) => {
      lastSetSnapshotRef.current = null;
      setEnded(true);
      setEndedStatus(status);
      // Deleted here, not deferred to clear() — confirmed live: clear() only runs once the
      // post-workout feedback screen is submitted or skipped, and the header back button can
      // leave that screen without ever calling it, so the row (and the "workout in progress"
      // impression it gives the coach) could survive indefinitely after the user considers the
      // workout over. The write effect still upserts state.ended=true right after this, but
      // deleting outright removes any live_session_state block for the coach to read at all,
      // which is the one signal brain-voice actually checks (see live-session-format.ts).
      const endingUserId = userIdRef.current;
      if (endingUserId) void supabase.from("live_session_state").delete().eq("user_id", endingUserId);
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
      appendMessage("user", text.trim());
      setCoachThinking(true);
      try {
        const snapshot = buildLiveSessionSnapshot({
          target,
          focus,
          exercises,
          currentExerciseIndex,
          loggedSets,
          resting,
          restTargetSec,
          restEndAt,
          restPausedRemainingSec,
          ended,
          paused,
          elapsedSec,
        });
        const liveSessionState = snapshot ? describeLiveSessionSnapshot(snapshot) : undefined;
        const result = await callBrain(userId, text.trim(), "text", false, undefined, liveSessionState);
        if (latestAskRef.current !== requestId) return;
        setCoachMessage(result.reply);
        appendMessage("coach", result.reply);

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
        appendMessage("coach", COACH_UNREACHABLE_MESSAGE);
      } finally {
        if (latestAskRef.current === requestId) setCoachThinking(false);
      }
    },
    [
      currentExerciseIndex,
      exercises,
      target,
      focus,
      loggedSets,
      resting,
      restTargetSec,
      restEndAt,
      restPausedRemainingSec,
      ended,
      paused,
      elapsedSec,
      appendMessage,
    ],
  );

  const announce = useCallback(
    (text: string) => {
      setCoachMessage(text);
      appendMessage("coach", text);
    },
    [appendMessage],
  );

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
      restReasonLabel,
      ended,
      endedStatus,
      workoutLogId,
      saving,
      hasLoggedAnySet: loggedSets.some((sets) => sets.length > 0),
      coachMessage,
      coachThinking,
      messages,
      appendMessage,
      elapsedSec,
      startedAt,
      paused,
      minimized,
      start,
      minimize,
      restore,
      logSet,
      skipExercise,
      addSet,
      undoLastSet,
      resolveOutgoingSession: persistPartialIfAny,
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
      pauseRest,
      resumeRest,
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
      restReasonLabel,
      ended,
      endedStatus,
      workoutLogId,
      saving,
      coachMessage,
      coachThinking,
      messages,
      appendMessage,
      elapsedSec,
      startedAt,
      paused,
      minimized,
      start,
      minimize,
      restore,
      logSet,
      skipExercise,
      addSet,
      undoLastSet,
      persistPartialIfAny,
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
      pauseRest,
      resumeRest,
    ],
  );

  return (
    <ActiveSessionCtx.Provider value={value}>
      {children}
    </ActiveSessionCtx.Provider>
  );
}
