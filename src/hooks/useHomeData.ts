import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callBrain } from '../lib/brain';
import { resolveTodaySession } from '../lib/resolveTodaySession';
import { MACRO_META, type MacroTarget } from '../screens/homeFormat';

export interface TodaySession {
  hasSession: boolean;
  planSessionId?: string;
  name?: string;
  exerciseCountLabel?: string;
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
  refetch: () => void;
}

const QUERY_TIMEOUT_MS = 12000;

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

function computeStreak(logTimestamps: string[]): number {
  const days = new Set(logTimestamps.map((at) => dateKey(new Date(at))));
  const cursor = new Date();
  if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(dateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

const DEFAULT_COACH_MESSAGE_NO_PLAN = "Let's build your plan — tap the orb and tell me your goals.";
const DEFAULT_COACH_MESSAGE_HAS_PLAN = 'Tap the orb any time to check in.';

// Fired at most once per real day (see the freshness check below) — hidden so it never shows up
// as a fake question in the visible chat transcript (see useHomeChat's query), but its reply
// becomes today's Home headline instead of whatever the coach last said in some unrelated
// conversation, possibly days ago.
const DAILY_GREETING_PROMPT =
  "Write today's Home screen greeting for me — the first thing I'll see today, not a reply to a question. Ground it in my actual plan and progress.";

const CAPTION_MAX_CHARS = 140;

// The brain's replies are full conversational turns (and sometimes carry markdown emphasis) —
// Home's caption is a compact teaser, not a chat transcript, so strip formatting and keep only
// the first sentence or two. Falls back one sentence at a time before ever hard-cutting mid-word
// — a flat char-slice was chopping words in half whenever two sentences together ran long, which
// the richer daily-greeting prompt (grounded in real plan + macros) hits far more often than a
// typical short Q&A reply did.
function sanitizeCoachMessage(raw: string): string {
  const stripped = raw
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();

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
  const [state, setState] = useState<Omit<HomeData, 'refetch'>>({
    loading: true,
    userId: null,
    userName: null,
    macros: null,
    todaySession: null,
    coachMessage: DEFAULT_COACH_MESSAGE_NO_PLAN,
    streakDays: 0,
    loadError: null,
  });
  const [refetchSignal, setRefetchSignal] = useState(0);
  const refetch = useCallback(() => setRefetchSignal((n) => n + 1), []);
  // Guards against two overlapping refetches (e.g. a fast tab-switch) both seeing "stale" and
  // firing their own generation call — same instance only; a real cross-device race is a
  // fabricated-not-corrupted duplicate greeting at worst, not the P0 class of bug.
  const greetingInFlightRef = useRef(false);

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

      const [profileRes, planRes, nutritionRes, foodRes, messageRes, workoutRes] = await Promise.all([
        settled('profile', supabase.from('profile').select('display_name').eq('user_id', userId).maybeSingle()),
        settled(
          'plan',
          supabase
            .from('training_plan')
            .select('id, plan_session(id, day_order, weekday, focus, plan_exercise(id))')
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
            .select('content, at')
            .eq('user_id', userId)
            .eq('role', 'assistant')
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
      ]);
      if (cancelled) return;

      console.log(`[home] all queries done in ${Date.now() - overallStarted}ms`);
      for (const [label, res] of [
        ['profile', profileRes], ['plan', planRes], ['nutrition', nutritionRes],
        ['food', foodRes], ['message', messageRes], ['workout', workoutRes],
      ] as const) {
        if (res.error) console.warn(`[home] ${label} error:`, res.error.message ?? res.error);
      }

      const plan = planRes.data;
      const hasPlan = !!plan;
      let todaySession: TodaySession | null = null;
      if (plan) {
        const sessionToday = resolveTodaySession(
          (plan.plan_session ?? []) as any[],
          (workoutRes.data ?? []) as any[],
        );
        todaySession = sessionToday
          ? {
              hasSession: true,
              planSessionId: sessionToday.id,
              name: sessionToday.focus?.toUpperCase() ?? 'TRAINING',
              exerciseCountLabel: `${sessionToday.plan_exercise?.length ?? 0} exercises`,
            }
          : { hasSession: false };
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

      const lastMessage = messageRes.data as { content: string; at: string } | null;
      const isFreshToday = lastMessage ? dateKey(new Date(lastMessage.at)) === dateKey(new Date()) : false;
      const staleFallback = lastMessage?.content
        ? sanitizeCoachMessage(lastMessage.content)
        : hasPlan
          ? DEFAULT_COACH_MESSAGE_HAS_PLAN
          : DEFAULT_COACH_MESSAGE_NO_PLAN;

      let coachMessage: string;
      if (isFreshToday && lastMessage?.content) {
        coachMessage = sanitizeCoachMessage(lastMessage.content);
      } else if (!hasPlan || greetingInFlightRef.current) {
        coachMessage = staleFallback;
      } else {
        greetingInFlightRef.current = true;
        try {
          const generated = await callBrain(userId, DAILY_GREETING_PROMPT, 'text', true);
          coachMessage = sanitizeCoachMessage(generated.reply);
        } catch (err) {
          console.warn('[home] daily greeting generation failed:', err);
          coachMessage = staleFallback;
        } finally {
          greetingInFlightRef.current = false;
        }
      }

      if (cancelled) return;

      const streakDays = computeStreak((workoutRes.data ?? []).map((row: any) => row.at));
      const userName = profileRes.data?.display_name ?? null;
      const loadError = planRes.error ? "Couldn't load your plan." : null;

      setState({ loading: false, userId, userName, macros, todaySession, coachMessage, streakDays, loadError });
    })();

    return () => {
      cancelled = true;
    };
  }, [refetchSignal]);

  return { ...state, refetch };
}
