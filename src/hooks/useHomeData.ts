import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { callBrain } from '../lib/brain';
import { resolveTodaySession, localDateKey } from '../lib/resolveTodaySession';
import { titleCase } from '../lib/textFormat';
import { canonicalizeExerciseNames } from '../lib/exerciseCatalog';
import { setCachedDisplayName } from '../lib/profileStore';
import { isPlanPending, clearPlanPending } from '../lib/planStatus';
import { HOME_CACHE_KEY } from '../lib/localUserData';
import { MACRO_META, getTimeBand, type MacroTarget } from '../screens/homeFormat';
import { greetingIsFreshToday as isGreetingFreshToday } from '../lib/greetingFreshness';
import { useLocalDayRollover } from './useLocalDayRollover';

export interface TodaySession {
  hasSession: boolean;
  planSessionId?: string;
  name?: string;
  exerciseCountLabel?: string;
  /** True only when the user explicitly chose today as a rest day (Switch Workout, or asking
   *  the coach) — distinct from hasSession:false as a byproduct of the plan's own rotation. */
  isRestDay?: boolean;
}

export interface HomeData {
  loading: boolean;
  userId: string | null;
  userName: string | null;
  macros: MacroTarget[] | null;
  todaySession: TodaySession | null;
  coachMessage: string;
  streakDays: number;
  loadError: string | null;
  /** Onboarding finished but the coach hadn't actually generated a plan yet as of the last
   *  check (see src/lib/planStatus.ts) — distinct from a user who genuinely has no plan for
   *  some other reason, so Home can show an actionable "still setting up" state instead of the
   *  generic empty one. */
  planPending: boolean;
  refetch: () => void;
  retryPlan: () => void;
}

const QUERY_TIMEOUT_MS = 12000;
const PENDING_RETRY_DELAYS_MS = [
  2000, 3000, 5000, 5000, 8000, 8000, 12000, 15000, 20000, 30000, 30000, 30000,
];

function timed<T>(label: string, work: PromiseLike<T>): Promise<T> {
  const started = Date.now();
  return Promise.race([
    Promise.resolve(work),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${QUERY_TIMEOUT_MS}ms`)), QUERY_TIMEOUT_MS),
    ),
  ]).then(
    (result) => {
      console.log(`[home] ${label} ${Date.now() - started}ms`);
      return result;
    },
    (err) => {
      console.warn(`[home] ${label} FAILED after ${Date.now() - started}ms:`, err?.message ?? err);
      throw err;
    },
  );
}

function settled<T>(label: string, work: PromiseLike<T>): Promise<{ data: any; error: any }> {
  return timed(label, work).then(
    (res: any) => res,
    (err) => ({ data: null, error: err }),
  );
}

const MACRO_COLUMNS: Record<MacroTarget['key'], string> = {
  protein: 'protein_g',
  carbs: 'carbs_g',
  fat: 'fat_g',
  calories: 'calories',
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// A chosen rest day holds the streak rather than breaking it (a deliberate skip isn't a missed
// day) or incrementing it (it wasn't a workout either) — restDayKeys uses the same local
// YYYY-MM-DD convention as rest_day.date (see localDateKey), logTimestamps' own dateKey format.
function computeStreak(logTimestamps: string[], restDayKeys: Set<string>): number {
  const days = new Set(logTimestamps.map((at) => dateKey(new Date(at))));
  const cursor = new Date();
  if (!days.has(dateKey(cursor)) && !restDayKeys.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(dateKey(cursor)) || restDayKeys.has(localDateKey(cursor))) {
    if (days.has(dateKey(cursor))) streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const DEFAULT_COACH_MESSAGE_NO_PLAN = "Let's build your plan — tap the orb and tell me your goals.";
const DEFAULT_COACH_MESSAGE_HAS_PLAN = 'Tap the orb any time to check in.';

// A cold app launch has nothing to show yet, so it briefly renders "Loading your plan…" instead
// of real content — confirmed as a jarring flash worth fixing. Caching the last successful load
// lets a relaunch show real (if a few minutes stale) content immediately while the fresh fetch
// runs quietly underneath; the plain loading state is now only ever seen on a genuine first-ever
// launch, when there's truly nothing to show.
type HomeDataCache = Omit<HomeData, 'loading' | 'loadError' | 'refetch' | 'retryPlan'>;

// Fired at most once per real day (see the freshness check below) — hidden so it never shows up
// as a fake question in the visible chat transcript (see useHomeChat's query), but its reply
// becomes today's Home headline instead of whatever the coach last said in some unrelated
// conversation, possibly days ago.
//
// The due session is spelled out directly in the prompt rather than left for the model to look
// up via read_state — confirmed live, twice: asked to "reference what's on my plan today," the
// model either picked the wrong session out of a full plan dump it had access to, or skipped
// calling read_state entirely and recalled a stale session from earlier in the conversation
// history. Since this screen already computes the correct due session deterministically for the
// session chip below the greeting, handing the model that same fact directly removes the failure
// entirely — there's no tool call, no history, and no other session for it to reach for instead.
function buildGreetingPrompt(
  sessionToday: { focus: string | null; exerciseNames: string[] } | null,
  nutrition: { caloriesLeft: number; proteinLeft: number } | null,
): string {
  const nutritionNote = nutrition
    ? ` They have calories and protein still to hit today — feel free to reference nutrition or recovery ` +
      `instead of the workout if that's more relevant right now (e.g. it's a rest day, or they haven't ` +
      `logged a meal yet today). Never state an exact calorie or gram figure: the screen shows those live, ` +
      `and this greeting is written once, so any number here goes stale the moment they log a meal.`
    : '';
  const questionNote =
    ' End with one short, specific question about how they\'re doing today (energy, hunger, soreness, ' +
    'how yesterday\'s session felt) — never a purely one-way statement.';
  // The clock time is stated here outright rather than pointed at ("the current time is in the
  // context below"). Pointing at it is what produced "I need the current time to greet you
  // naturally" as the actual greeting on Home: asked for something it believed it was missing,
  // the model narrated the gap instead of answering. Giving it the value removes the gap.
  const now = new Date();
  const clock = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const day = now.toLocaleDateString(undefined, { weekday: 'long' });
  const timeNote =
    ` It is currently ${clock} on ${day}. Let that inform the greeting naturally (never "good ` +
    'morning" in the evening, and a late-night greeting reads differently than an early one) ' +
    'without literally stating the clock time. Never ask for the time and never mention needing ' +
    'it — you have it.';

  if (!sessionToday) {
    return (
      "Say hello for the first time today — not a reply to a question, and not generic small talk. Today " +
      "is a rest day (or there's nothing due) — one short, motivating line about that, progress toward my " +
      `goal, or nutrition/recovery.${nutritionNote}${questionNote}${timeNote}`
    );
  }
  const exercises = sessionToday.exerciseNames.length > 0 ? sessionToday.exerciseNames.join(', ') : 'the exercises in it';
  return (
    `Say hello for the first time today — not a reply to a question, and not generic small talk. ` +
    `Today's due session is "${sessionToday.focus}": ${exercises}. One short, motivating line that names ` +
    `this exact session and nothing else — do not call read_state, do not mention any other session from ` +
    `earlier in this conversation, and do not invent a day number or exercises not listed here.` +
    `${nutritionNote}${questionNote}${timeNote}`
  );
}

const CAPTION_MAX_CHARS = 140;

// The brain's replies are full conversational turns (and sometimes carry markdown emphasis) —
// Home's caption is a compact teaser, not a chat transcript, so strip formatting and keep only
// the first sentence or two. Falls back one sentence at a time before ever hard-cutting mid-word
// — a flat char-slice was chopping words in half whenever two sentences together ran long, which
// the richer daily-greeting prompt (grounded in real plan + macros) hits far more often than a
// typical short Q&A reply did.
// Phrases that mean the model narrated its own process instead of greeting — asking for input it
// should already have, describing what it needs, or refusing. Home renders this string as the
// coach's voice with no chat context around it, so a leak like "I need the current time to greet
// you naturally" reads as the product being broken rather than as a bad turn. Matched on the whole
// message, and only ever used to fall back to the default greeting, never to edit the text.
// Deliberately narrow. "I need …" on its own is ordinary coaching ("I need you to slow the
// eccentric"), so the missing-input patterns only fire when what's wanted is the kind of thing
// the app supplies rather than the user — time, date, context, data. Over-matching here costs a
// real greeting and replaces it with a generic one, so precision matters more than coverage.
const MISSING_INPUT = /\b(?:i (?:need|require|don'?t have|do not have|am missing|'m missing)|could you (?:tell|provide|give) me)\b[^.!?]{0,60}\b(?:current |the )?(?:time|date|day of|clock|context|information|data|details)\b/i;

const META_LEAK_PATTERNS = [
  MISSING_INPUT,
  /\b(?:in order )?to greet you (?:naturally|properly|appropriately)\b/i,
  /\bas an ai\b/i,
  /\b(?:system|context) (?:note|block|prompt)\b/i,
  /\[system\b/i,
];

export function looksLikeMetaLeak(text: string): boolean {
  return META_LEAK_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeCoachMessage(raw: string): string {
  const stripped = canonicalizeExerciseNames(
    raw
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/\s*\n+\s*/g, ' ')
      .trim(),
  );

  const sentences = stripped.split(/(?<=[.!?])\s+/);

  const twoSentences = sentences.slice(0, 2).join(' ');
  if (twoSentences.length <= CAPTION_MAX_CHARS) return twoSentences;

  const oneSentence = sentences[0] ?? '';
  if (oneSentence.length <= CAPTION_MAX_CHARS) return oneSentence;

  const lastSpace = oneSentence.slice(0, CAPTION_MAX_CHARS).lastIndexOf(' ');
  const cut = lastSpace > 0 ? oneSentence.slice(0, lastSpace) : oneSentence.slice(0, CAPTION_MAX_CHARS);
  return `${cut.trimEnd()}…`;
}

export function useHomeData(): HomeData {
  const [state, setState] = useState<Omit<HomeData, 'refetch' | 'retryPlan'>>({
    loading: true,
    userId: null,
    userName: null,
    macros: null,
    todaySession: null,
    coachMessage: DEFAULT_COACH_MESSAGE_NO_PLAN,
    streakDays: 0,
    loadError: null,
    planPending: false,
  });
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  const pendingRetryCountRef = useRef(0);
  const retryPlan = useCallback(() => {
    pendingRetryCountRef.current = 0;
    setRefetchSignal((n) => n + 1);
  }, []);

  // Today's session, the greeting, and the nutrition window are all scoped to the user's local
  // day, so all three have to be re-read the moment that day turns over — not whenever the screen
  // next happens to regain focus. See useLocalDayRollover.
  useLocalDayRollover(refetch);
  // Guards against two overlapping refetches (e.g. a fast tab-switch) both seeing "stale" and
  // firing their own generation call — same instance only; a real cross-device race is a
  // fabricated-not-corrupted duplicate greeting at worst, not the P0 class of bug.
  const greetingInFlightRef = useRef(false);
  const loadedFromNetworkRef = useRef(false);
  const planPendingRef = useRef(false);
  planPendingRef.current = state.planPending;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (appState) => {
      if (appState !== 'active' || !planPendingRef.current) return;
      retryPlan();
    });
    return () => subscription.remove();
  }, [retryPlan]);

  // Runs once, in parallel with the real fetch below — an AsyncStorage read resolves in a few ms,
  // long before any network round-trip, so this reliably wins the race and replaces the plain
  // "Loading your plan…" state with real (if briefly stale) content. Guarded by
  // loadedFromNetworkRef so a slow cache read can never clobber a fetch that already finished.
  useEffect(() => {
    (async () => {
      try {
        const [raw, { data: sessionData }] = await Promise.all([
          AsyncStorage.getItem(HOME_CACHE_KEY),
          supabase.auth.getSession(),
        ]);
        if (!raw || loadedFromNetworkRef.current) return;
        const cached: HomeDataCache = JSON.parse(raw);
        if (!cached.userId || cached.userId !== sessionData.session?.user.id) {
          await AsyncStorage.removeItem(HOME_CACHE_KEY).catch(() => null);
          return;
        }
        setState((prev) => (prev.loading ? { ...cached, loading: false, loadError: null } : prev));
      } catch (err) {
        console.warn('[home] failed to read cached data:', err);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const overallStarted = Date.now();
      let session = null;
      try {
        session = (await timed('auth.getSession', supabase.auth.getSession())).data.session;
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, loading: false, loadError: 'Could not reach your account.' }));
        }
        return;
      }

      const userId = session?.user.id;
      if (!userId) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

      const [profileRes, planRes, nutritionRes, foodRes, messageRes, workoutRes, restDayRes, overrideRes] =
        await Promise.all([
        settled('profile', supabase.from('profile').select('display_name').eq('user_id', userId).maybeSingle()),
        settled(
          'plan',
          supabase
            .from('training_plan')
            .select(
              'id, created_at, plan_session(id, day_order, weekday, focus, plan_exercise(id, ord, exercise:exercise_id(name)))',
            )
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle(),
        ),
        settled(
          'nutrition',
          supabase.from('nutrition_target').select('calories,protein_g,carbs_g,fat_g').eq('user_id', userId).maybeSingle(),
        ),
        settled(
          'food',
          supabase
            .from('food_log')
            .select('calories,protein_g,carbs_g,fat_g')
            .eq('user_id', userId)
            .gte('at', startOfDay.toISOString()),
        ),
        settled(
          'message',
          supabase
            .from('message')
            .select('content, at, greeting_key')
            .eq('user_id', userId)
            .eq('role', 'assistant')
            .eq('hidden', true)
            .order('at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
        settled(
          'workout',
          supabase
            .from('workout_log')
            .select('at, plan_session_id, status')
            .eq('user_id', userId)
            .order('at', { ascending: false })
            .limit(60),
        ),
        settled(
          'rest_day',
          supabase.from('rest_day').select('date').eq('user_id', userId).gte('date', localDateKey(ninetyDaysAgo)),
        ),
        settled(
          'day_override',
          supabase
            .from('day_override')
            .select('plan_session(id, day_order, weekday, focus, plan_exercise(id, ord, exercise:exercise_id(name)))')
            .eq('user_id', userId)
            .eq('date', localDateKey(new Date()))
            .maybeSingle(),
        ),
      ]);
      if (cancelled) return;

      console.log(`[home] all queries done in ${Date.now() - overallStarted}ms`);
      for (const [label, res] of [
        ['profile', profileRes], ['plan', planRes], ['nutrition', nutritionRes],
        ['food', foodRes], ['message', messageRes], ['workout', workoutRes], ['rest_day', restDayRes],
        ['day_override', overrideRes],
      ] as const) {
        if (res.error) console.warn(`[home] ${label} error:`, res.error.message ?? res.error);
      }

      const restDayDates = new Set(((restDayRes.data ?? []) as any[]).map((r) => r.date as string));
      const todayKey = localDateKey(new Date());

      const plan = planRes.data;
      const hasPlan = !!plan;
      // A one-off session the coach built for today (create_custom_session) replaces whatever the
      // plan says is due — including a rest day — so it's resolved here alongside the plan rather
      // than as a special case afterwards. It's also why `plan` alone no longer gates this block:
      // a custom session is due whether or not there's an active plan behind it.
      const overrideSession = (() => {
        const row = (overrideRes.data as any)?.plan_session ?? null;
        return (Array.isArray(row) ? row[0] : row) ?? null;
      })();

      let todaySession: TodaySession | null = null;
      let greetingSession: { focus: string | null; exerciseNames: string[] } | null = null;
      if (plan || overrideSession) {
        const sessionToday = resolveTodaySession(
          (plan?.plan_session ?? []) as any[],
          (workoutRes.data ?? []) as any[],
          new Date(),
          restDayDates,
          overrideSession,
        );
        todaySession = sessionToday
          ? {
              hasSession: true,
              planSessionId: sessionToday.id,
              name: titleCase(sessionToday.focus) === '—' ? 'Training' : titleCase(sessionToday.focus),
              exerciseCountLabel: `${sessionToday.plan_exercise?.length ?? 0} exercises`,
            }
          : { hasSession: false, isRestDay: restDayDates.has(todayKey) };
        greetingSession = sessionToday
          ? {
              // Humanized before it reaches the prompt, not just before it reaches a label. The
              // raw value went straight into the greeting instruction, so the coach repeated it
              // verbatim and Home read "Time to hit upper_push".
              focus: sessionToday.focus ? titleCase(sessionToday.focus) : null,
              exerciseNames: (sessionToday.plan_exercise ?? [])
                .slice()
                .sort((a: any, b: any) => a.ord - b.ord)
                .map((e: any) => e.exercise?.name)
                .filter(Boolean),
            }
          : null;
      }

      const nutrition = nutritionRes.data;
      const macros: MacroTarget[] | null = nutrition
        ? (Object.keys(MACRO_META) as MacroTarget['key'][]).map((key) => {
            const goal = (nutrition as any)[MACRO_COLUMNS[key]] ?? 0;
            const current = ((foodRes.data ?? []) as any[]).reduce(
              (sum: number, row: any) => sum + (row[MACRO_COLUMNS[key]] ?? 0),
              0,
            );
            return { key, ...MACRO_META[key], current, goal };
          })
        : null;

      const lastGreeting = messageRes.data as
        | { content: string; at: string; greeting_key: string | null }
        | null;
      // Same-day isn't enough on its own — completing a session mid-day rotates a flexible
      // plan to the next one (or clears today's session on a pinned plan), and a greeting
      // generated before that still describes the workout that's no longer queued up. A plan
      // edit (new goal, injury-driven change, a fresh split) is the same problem: confirmed
      // live, a greeting cached from earlier the same day kept describing a workout from a
      // plan that had since been replaced, while the (correctly live-queried) session chip
      // right below it had already moved on — two true-looking but contradictory answers.
      const mostRecentWorkoutAt = ((workoutRes.data ?? []) as any[]).reduce(
        (latest: string | null, row: any) => (!latest || new Date(row.at) > new Date(latest) ? row.at : latest),
        null as string | null,
      );
      const planCreatedAt = (plan as any)?.created_at ?? null;
      // What today's greeting is *about*. A greeting names the session and its exercises, so it
      // stops being true the moment today resolves to a different session — which the three
      // time-based checks below cannot see. Confirmed live: the headline read "Upper Pull tonight
      // — Deadlift, Lat Pulldown, Seated Row, Face Pull" directly above a session chip reading
      // "LOWER, 4 exercises". A cached greeting with no key at all predates this column, so it is
      // treated as unverifiable and regenerated once rather than trusted.
      const greetingKey = todaySession?.hasSession ? todaySession.planSessionId : 'rest';
      const greetingIsFreshToday = isGreetingFreshToday({
        lastGreeting,
        greetingKey,
        mostRecentWorkoutAt,
        planCreatedAt,
      });

      let coachMessage: string;
      // A leaked greeting gets persisted like any other, so it would otherwise keep reappearing
      // from cache all day — the check has to run on the stored copy too, not just fresh output.
      if (greetingIsFreshToday && lastGreeting?.content && !looksLikeMetaLeak(lastGreeting.content)) {
        coachMessage = sanitizeCoachMessage(lastGreeting.content);
      } else if (!hasPlan) {
        coachMessage = DEFAULT_COACH_MESSAGE_NO_PLAN;
      } else if (greetingInFlightRef.current) {
        coachMessage = DEFAULT_COACH_MESSAGE_HAS_PLAN;
      } else {
        greetingInFlightRef.current = true;
        try {
          const proteinMacro = macros?.find((m) => m.key === 'protein');
          const caloriesMacro = macros?.find((m) => m.key === 'calories');
          const nutritionForGreeting =
            proteinMacro && caloriesMacro
              ? {
                  caloriesLeft: Math.max(0, caloriesMacro.goal - caloriesMacro.current),
                  proteinLeft: Math.max(0, proteinMacro.goal - proteinMacro.current),
                }
              : null;
          const generated = await callBrain({
            userId,
            message: buildGreetingPrompt(greetingSession, nutritionForGreeting),
            hidden: true,
            isDailyGreeting: true,
            greetingKey,
          });
          coachMessage = looksLikeMetaLeak(generated.reply)
            ? hasPlan
              ? DEFAULT_COACH_MESSAGE_HAS_PLAN
              : DEFAULT_COACH_MESSAGE_NO_PLAN
            : sanitizeCoachMessage(generated.reply);
        } catch (err) {
          console.warn('[home] daily greeting generation failed:', err);
          coachMessage = DEFAULT_COACH_MESSAGE_HAS_PLAN;
        } finally {
          greetingInFlightRef.current = false;
        }
      }

      if (cancelled) return;

      const streakDays = computeStreak((workoutRes.data ?? []).map((row: any) => row.at), restDayDates);
      const userName = profileRes.data?.display_name ?? null;
      if (!profileRes.error) setCachedDisplayName(userId, userName);
      const loadError = planRes.error ? "Couldn't load your plan." : null;

      let planPending = false;
      if (hasPlan) {
        clearPlanPending(userId);
        pendingRetryCountRef.current = 0;
      } else {
        planPending = await isPlanPending(userId);
        const delay = PENDING_RETRY_DELAYS_MS[pendingRetryCountRef.current];
        if (planPending && delay !== undefined) {
          pendingRetryCountRef.current += 1;
          setTimeout(() => {
            if (!cancelled) refetch();
          }, delay);
        }
      }
      if (cancelled) return;

      loadedFromNetworkRef.current = true;
      const next = { loading: false, userId, userName, macros, todaySession, coachMessage, streakDays, loadError, planPending };
      setState(next);
      if (!loadError) {
        const { loading: _loading, loadError: _loadError, ...cacheable } = next;
        AsyncStorage.setItem(HOME_CACHE_KEY, JSON.stringify(cacheable)).catch((err) =>
          console.warn('[home] failed to cache data:', err),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { ...state, refetch, retryPlan };
}
