import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBrainTurn } from '../_shared/brain-orchestrator.ts';
import { APP_LINE_MODALITY, replayHistory } from '../_shared/replay-history.ts';
import { dropLeadingConcession, dropSelfCorrection } from '../_shared/humanize.ts';
import {
  buildStaticSystemPrompt,
  createCallModel,
  MODEL as BRAIN_MODEL,
  MESSAGE_HISTORY_LIMIT,
} from '../_shared/brain-config.ts';
import { buildContextBlock, startOfLocalDayUtc } from '../_shared/brain-context.ts';
import { createHandlers } from '../_shared/brain-handlers.ts';
import { VOICE_TOOLS } from '../_shared/brain-tools.ts';
import { buildLiveSessionSnapshot, describeLiveSessionSnapshot, LIVE_STATE_MAX_AGE_MS } from '../_shared/live-session-format.ts';
import { resolveTurnText } from '../_shared/system-cue.ts';
import { verbalizeUnitsForSpeech } from '../_shared/verbalize-for-speech.ts';
import { stripSystemNote, createSystemNoteFilter } from '../_shared/strip-system-note.ts';
import { scrubInternalLanguage } from '../_shared/scrub-internal.ts';
import {
  describeCueFacts,
  describeResumedStart,
  isLiveStrengthSession,
  resolveTurnSetOutcome,
  type TurnSetOutcome,
} from '../_shared/turn-set-outcome.ts';
import {
  claimFallback,
  guardClaims,
  isUnbackedClaim,
  trackToolOutcomes,
  withGuardedFinalText,
  type ClaimGuardState,
} from '../_shared/claim-guard.ts';
import {
  HOLDS_MISSING_WEIGHT_FROM_VERSION,
  looksLikeFinishedSetReport,
  SHARED_PARSER_FROM_VERSION,
} from '../_shared/set-report.ts';

const callModel = createCallModel(VOICE_TOOLS);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHARED_SECRET = Deno.env.get('BRAIN_VOICE_SHARED_SECRET')!;

const USER_ID_MARKER = /MUSTLE_CONTEXT:(\{[^}]*\})/;
// A synthetic "user" turn the app injects via sendUserMessage to prompt the coach to speak
// proactively (workout greeting, rest countdown, etc.) at moments nobody actually said anything —
// sendUserMessage is the only client call that makes the agent produce a real spoken reply
// (sendContextualUpdate never triggers one). It isn't something the user said, so it's logged
// hidden — still real context for the model, just excluded from the human-visible transcript.
const SYSTEM_CUE_PREFIX = '[[SYSTEM_CUE]]';
// A cue (session_start, set_logged, rest_over, etc.) is system-generated, not something the user
// said — it only ever needs the live session state and current context (already in the system
// prompt), not the day's full chat history. Fetching all MESSAGE_HISTORY_LIMIT rows for these
// turns was pure extra tokens on exactly the turns where reply speed matters most (mid-workout).
// A small window is kept, not zero, so cues like silence_after_rest_final ("don't repeat the same
// phrasing as before") can still see what was just said.
const CUE_MESSAGE_HISTORY_LIMIT = 12;
const HISTORY_LOOKBACK_MS = 30 * 60 * 60 * 1000;
// session_start is the exception that gets NO history at all. It opens a brand new workout, so
// every fact it needs is in the context block and the live session state block — while the most
// recent messages are, by definition, the *previous* workout, and they read as though they are
// still in progress. Confirmed live: a fresh session with zero sets logged was greeted with
// "Back Squat, six to eight reps at sixty kilograms, set 2" — both the set number and a weight
// that appears nowhere in live state, carried over from the last session's conversation. No
// prompt wording reliably beats a dozen replayed messages describing a set in progress; not
// showing them to the model at all does.
const SESSION_START_CUE = 'session_start';
const NO_IDENTITY_REPLY =
  "I couldn't identify your account for this conversation — please reopen the app and try again.";
const VOICE_ERROR_REPLY = "I'm having trouble reaching your plan right now — let's try again in a moment.";

// The prompt tells the model that staying quiet means returning no text, but it cannot be relied
// on: every token it emits is spoken aloud, so a model reaching for a way to express "say nothing"
// makes the coach announce the word "Silence" to the user's face. Confirmed live. The client strips
// these from the transcript, which only hides the text — the audio has already been synthesised
// from whatever this function returns, so suppressing it has to happen here.
const SILENCE_PLACEHOLDER = /^(?:silence|no response|no reply|nothing|\.{2,}|…)$/i;

function isSilencePlaceholder(text: string): boolean {
  const bare = text
    .replace(/[[(][^\])]*[\])]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?,]+$/, '')
    .trim();
  return bare === '' || SILENCE_PLACEHOLDER.test(bare);
}

function sanitizeForChat(text: string): string {
  return scrubInternalLanguage(dropSelfCorrection(dropLeadingConcession(text)))
    .replace(/\[\[SYSTEM_CUE\]\]\s*\S*/gi, '')
    .trim();
}

function sanitizeForSpeech(text: string): string {
  return scrubInternalLanguage(dropSelfCorrection(dropLeadingConcession(verbalizeUnitsForSpeech(text))))
    .replace(/\[\[SYSTEM_CUE\]\]\s*\S*/gi, '')
    .replace(/\s*[—–]\s*/g, ', ');
}

// Both userId and timezone travel in via the same MUSTLE_CONTEXT marker, embedded in the
// ElevenLabs agent's system prompt template (dashboard-configured, not this repo) from
// dynamicVariables the client passes at session start — see useVoiceSession's config.
// timezone requires the dashboard template to actually include {{user_timezone}} in the marker,
// same as it already does for {{user_id}}; until that's added there, this falls back to null and
// buildContextBlock/createHandlers fall back to the stored profile value.
function extractContext(messages: any[]): { userId: string | null; timezone: string | null } {
  const systemMessage = messages.find((m: any) => m?.role === 'system');
  const content = systemMessage?.content;
  const match = typeof content === 'string' ? content.match(USER_ID_MARKER) : null;
  if (!match) return { userId: null, timezone: null };
  try {
    const parsed = JSON.parse(match[1]);
    const userId = typeof parsed.userId === 'string' && parsed.userId.length > 0 ? parsed.userId : null;
    const timezone = typeof parsed.timezone === 'string' && parsed.timezone.length > 0 ? parsed.timezone : null;
    return { userId, timezone };
  } catch {
    return { userId: null, timezone: null };
  }
}

const SET_CONFIRMING_CUES = new Set(['set_logged', 'exercise_advanced']);

async function prepareTurn(userId: string, userText: string, timezone: string | null, isFirstTurnOfCall: boolean) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

  const askedAt = new Date();
  const isSystemCue = userText.startsWith(SYSTEM_CUE_PREFIX);
  const cueName = isSystemCue ? userText.slice(SYSTEM_CUE_PREFIX.length).trim() : null;
  const isSessionStart = cueName === SESSION_START_CUE;
  const historyLimit = isSessionStart ? 0 : isSystemCue ? CUE_MESSAGE_HISTORY_LIMIT : MESSAGE_HISTORY_LIMIT;
  // TEMPORARY — voice-timing instrumentation to find the session-start latency source. Remove
  // once the slow phase is identified.
  const tPrepare0 = Date.now();
  console.log(`[voice-timing:server] prepareTurn: begin @${tPrepare0}, historyLimit=${historyLimit}`);
  // Same local-calendar-day boundary as text chat's history (see brain/index.ts) — a call
  // starting today shouldn't replay yesterday's conversation as prior turns, even though the
  // greet decision below is already scoped tighter still (per-call, via isFirstTurnOfCall).
  const historyQuery =
    historyLimit === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from('message')
          .select('role,content,blocks,at,hidden,greeting_key,modality')
          .eq('user_id', userId)
          .gte('at', new Date(Date.now() - HISTORY_LOOKBACK_MS).toISOString())
          .order('at', { ascending: false })
          .order('role', { ascending: true })
          .limit(historyLimit);
  const [{ data: history, error: historyError }, contextBlock, { data: liveRow }, { data: profileRow }] =
    await Promise.all([
      historyQuery,
      buildContextBlock(supabase, userId, timezone, isSystemCue ? null : userText),
      supabase.from('live_session_state').select('state, updated_at').eq('user_id', userId).maybeSingle(),
      supabase.from('profile').select('timezone, unit_prefs').eq('user_id', userId).maybeSingle(),
    ]);
  console.log(`[voice-timing:server] prepareTurn: parallel fetch done, +${Date.now() - tPrepare0}ms`);
  if (historyError) throw new Error(`message fetch: ${historyError.message}`);

  const isLiveStateFresh = !!liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
  const liveSnapshot = isLiveStateFresh ? buildLiveSessionSnapshot(liveRow!.state) : null;
  const units = profileRow?.unit_prefs === 'imperial' ? 'imperial' : 'metric';
  const liveBlock = liveSnapshot ? describeLiveSessionSnapshot(liveSnapshot, units) : null;

  const lastCoachRow = (history ?? []).find(
    (m: any) => m.role === 'assistant' && !m.greeting_key && m.modality !== APP_LINE_MODALITY,
  );
  const recentUserMessages = (history ?? [])
    .filter((m: any) => m.role === 'user' && !m.hidden && !String(m.content ?? '').startsWith(SYSTEM_CUE_PREFIX))
    .slice(0, 3)
    .map((m: any) => ({ content: String(m.content ?? ''), at: m.at ?? null }));
  const clientParserVersion = Number((liveRow?.state as any)?.setParser ?? 1);
  const setOutcome: TurnSetOutcome | null = isSystemCue
    ? null
    : resolveTurnSetOutcome({
        userText,
        snapshot: liveSnapshot,
        units,
        lastCoachMessage: lastCoachRow ? { content: String(lastCoachRow.content ?? ''), at: lastCoachRow.at ?? null } : null,
        recentUserMessages,
        legacyClient: clientParserVersion < SHARED_PARSER_FROM_VERSION,
        holdsMissingWeight: clientParserVersion >= HOLDS_MISSING_WEIGHT_FROM_VERSION,
      });
  const resumeNote = isSessionStart ? describeResumedStart(liveSnapshot, units) : null;
  const cueFacts = describeCueFacts(cueName, liveSnapshot, units);
  const contextParts = [contextBlock, liveBlock, setOutcome?.note, resumeNote, cueFacts].filter(Boolean);
  const fullContextBlock = contextParts.join('\n\n');

  const tracked = trackToolOutcomes(
    createHandlers(supabase, userId, timezone, {
      currentUserText: userText,
      appLoggedThisTurn: setOutcome?.kind === 'logged' || (cueName !== null && SET_CONFIRMING_CUES.has(cueName)),
    }),
  );
  const handlers = tracked.handlers;
  const liveSession = isLiveStrengthSession(liveSnapshot);
  const guardState = (): ClaimGuardState => ({
    liveSession,
    setLoggedThisTurn:
      setOutcome?.kind === 'logged' || (cueName !== null && SET_CONFIRMING_CUES.has(cueName)) || tracked.outcomes.setLogged,
    restActive: liveSnapshot?.status === 'resting',
    actionSucceededThisTurn: tracked.outcomes.actionSucceeded,
  });
  const fallbackReply = claimFallback(liveSession, !isSystemCue && looksLikeFinishedSetReport(userText));

  // A workout's conversation must not leak into the next one. The app stamps live_session_state
  // with when the current session started; anything older belongs to a previous workout and reads
  // to the model as though it were still in progress — confirmed live: after force-quitting
  // mid-workout and starting over, the screen was back on set 1 while the coach insisted it was
  // set 3, because the killed session's turns were still being replayed. Scoping to the stamp keeps
  // the coach's memory exactly as long as the app's own: leaving the screen and coming back via
  // Home's in-progress card is the same session and remembers the weight, while killing the app
  // starts a new one and forgets what the UI forgot.
  const sessionStartedAt = isLiveStateFresh ? (liveRow!.state as any)?.startedAt : null;
  const dayStart = startOfLocalDayUtc(timezone || profileRow?.timezone || null).getTime();
  const todayHistory = (history ?? []).filter((m: any) => !m.at || new Date(m.at).getTime() >= dayStart);
  const scopedHistory =
    typeof sessionStartedAt === 'string'
      ? todayHistory.filter((m: any) => !m.at || m.at >= sessionStartedAt)
      : todayHistory;
  const priorMessages = replayHistory(dropSupersededFromHistory(scopedHistory.slice().reverse(), userText));
  const turnMessages = [...priorMessages, { role: 'user', content: resolveTurnText(userText) }];
  // Greeting is a per-CALL decision ("say hello once when this call starts"), not a per-DAY one —
  // even today's `history` above is non-empty for anyone who already texted or called earlier
  // today, so keying the greet instruction off it would tell the model "don't greet" on every
  // later call of the same day. isFirstTurnOfCall instead comes from ElevenLabs' own growing
  // transcript for *this* call (see Deno.serve below), so a brand new call greets regardless of
  // how much history exists, and a mid-call turn never re-greets.
  const systemPrompt = {
    static: buildStaticSystemPrompt(!isFirstTurnOfCall, 'voice'),
    dynamic: fullContextBlock,
  };
  console.log(`[voice-timing:server] prepareTurn: done, +${Date.now() - tPrepare0}ms total`);
  if (setOutcome) console.log(`[brain-voice] set outcome for this turn: ${setOutcome.kind}`);

  return { supabase, handlers, turnMessages, systemPrompt, askedAt, guardState, fallbackReply };
}

function guardReply(reply: string, state: ClaimGuardState, fallback: string): string {
  const { text, dropped } = guardClaims(reply, state);
  if (dropped.length === 0) return reply;
  console.warn('[brain-voice] dropped unbacked claims:', dropped.join(' | '));
  return text || fallback;
}

// ElevenLabs calls this function more than once for a single spoken turn — first on a preliminary
// transcript, then again on the corrected one — and only the last reply is ever spoken. Confirmed
// live: their conversation record held one user turn ("Hip Thrust, set one, done ten reps, 80 kg")
// where `message` held two, the extra one being a transcript the user never actually produced
// ("10 reps" vs "ten reps") alongside an answer that was never voiced. That discarded pair is
// replayed as history on the following turn, so the model sees a set report it never heard and an
// answer it never gave, and tells the user their set is "already logged". Keeping only the newest
// transcript of a turn is what stops us feeding it a conversation that did not happen.
//
// The turn lock above cannot cover this: those invocations are concurrent retries of one request,
// while these arrive seconds apart, after the first has already replied and released.
const SUPERSEDED_TURN_WINDOW_MS = 12_000;
const SUPERSEDED_TURN_CONTAINMENT = 0.85;
// Anything shorter is contained in almost any later sentence by accident — "80 kg." sits entirely
// inside "set one done, ten reps, 80 kg", which is an answer followed by a report, not one turn
// transcribed twice.
const SUPERSEDED_TURN_MIN_TOKENS = 4;

const turnTokens = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

// Containment rather than Jaccard: a corrected transcript is usually the same words plus a few
// ("set one done eight reps" -> "set one done eight reps of 50 kg"), which Jaccard scores far too
// low to catch. Deliberately tight enough that consecutive real sets stay distinct — "set two done
// eight reps" against "set one done eight reps" scores 0.8 and is left alone.
function turnContainment(a: string, b: string): number {
  const first = new Set(turnTokens(a));
  const second = new Set(turnTokens(b));
  if (first.size === 0 || second.size === 0) return 0;
  let shared = 0;
  for (const token of first) if (second.has(token)) shared += 1;
  return shared / Math.min(first.size, second.size);
}

// The delete below keeps the stored record clean, but it runs after the reply has already been
// generated, so on its own it never stopped the model *seeing* the turn it supersedes. Confirmed
// live: the duplicate pair was gone from the transcript and the coach still answered "I already
// have set two logged", because prepareTurn had fetched history before the cleanup ran. This
// filters the same pair out of the replayed history instead, so the corrected transcript is the
// only version of that turn the model is ever shown.
function dropSupersededFromHistory(ordered: any[], userText: string): any[] {
  if (userText.startsWith(SYSTEM_CUE_PREFIX)) return ordered;
  if (turnTokens(userText).length < SUPERSEDED_TURN_MIN_TOKENS) return ordered;
  for (let i = ordered.length - 1; i >= 0; i--) {
    const message = ordered[i];
    if (message.role !== 'user') continue;
    const content = String(message.content ?? '');
    if (content.startsWith(SYSTEM_CUE_PREFIX)) return ordered;
    if (turnTokens(content).length < SUPERSEDED_TURN_MIN_TOKENS) return ordered;
    if (message.at && Date.now() - new Date(message.at).getTime() > SUPERSEDED_TURN_WINDOW_MS) return ordered;
    if (turnContainment(content, userText) < SUPERSEDED_TURN_CONTAINMENT) return ordered;
    return ordered.slice(0, i);
  }
  return ordered;
}

async function dropSupersededTurn(supabase: any, userId: string, userText: string, askedAt: Date) {
  const { data, error } = await supabase
    .from('message')
    .select('id, role, content, at')
    .eq('user_id', userId)
    .eq('modality', 'voice')
    .gte('at', new Date(askedAt.getTime() - SUPERSEDED_TURN_WINDOW_MS).toISOString())
    .order('at', { ascending: false })
    .limit(4);
  if (error || !data?.length) return;

  const lastUser = data.find((m: any) => m.role === 'user');
  if (!lastUser || lastUser.content.startsWith(SYSTEM_CUE_PREFIX)) return;
  // Both sides, not just the older one. A corrected transcript is the same turn said again, so it
  // is never much shorter — confirmed live: "Hey, set one is done, 50 kg, eight reps" followed by
  // a bare "50 kg" scores a perfect containment against the short side and would have deleted a
  // real, different turn.
  if (turnTokens(lastUser.content).length < SUPERSEDED_TURN_MIN_TOKENS) return;
  if (turnTokens(userText).length < SUPERSEDED_TURN_MIN_TOKENS) return;
  if (turnContainment(lastUser.content, userText) < SUPERSEDED_TURN_CONTAINMENT) return;

  const supersededIds = [
    lastUser.id,
    ...data.filter((m: any) => m.role === 'assistant' && m.at > lastUser.at).map((m: any) => m.id),
  ];
  const { error: deleteError } = await supabase.from('message').delete().in('id', supersededIds);
  if (deleteError) {
    console.error('[brain-voice] failed to drop superseded turn:', deleteError.message);
    return;
  }
  console.log(`[brain-voice] dropped superseded turn (${supersededIds.length} rows): ${lastUser.content}`);
}

async function logConversation(
  supabase: any,
  userId: string,
  userText: string,
  askedAt: Date,
  rawReply: string,
  turnBlocks: any[],
) {
  const strippedReply = stripSystemNote(rawReply);
  const reply = isSilencePlaceholder(strippedReply) ? '' : sanitizeForChat(strippedReply);
  const repliedAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));
  const isSystemCue = userText.startsWith(SYSTEM_CUE_PREFIX);
  if (!isSystemCue) await dropSupersededTurn(supabase, userId, userText, askedAt);
  const { error } = await supabase.from('message').insert([
    {
      user_id: userId,
      role: 'user',
      content: userText,
      modality: 'voice',
      hidden: isSystemCue,
      at: askedAt.toISOString(),
    },
    {
      user_id: userId,
      role: 'assistant',
      content: reply,
      modality: 'voice',
      hidden: isSystemCue && !reply,
      blocks: turnBlocks.length > 0 ? turnBlocks : null,
      at: repliedAt.toISOString(),
    },
  ]);
  if (error) console.error('[brain-voice] failed to log conversation:', error.message);
}

// A row older than this is from an invocation that crashed or got killed before its `finally`
// could clean up — treated as abandoned so a genuinely stuck lock can't wedge a user's voice
// turns forever. Comfortably above the slowest real turn seen in testing (~20s) without being so
// long that a crash blocks the user for an unreasonable stretch.
const TURN_LOCK_STALE_MS = 45_000;
// How long a follower (a retried request that found a turn already in flight) will wait for the
// leader's reply before giving up and returning a generic error — must exceed the leader's own
// worst-case latency, or a slow-but-successful leader turn gets wasted every time.
const TURN_LOCK_WAIT_MS = 40_000;
const TURN_LOCK_POLL_MS = 400;
// A genuine leader's askedAt is always at or before this follower's own arrival (the follower only
// exists because it found the leader's row already there) — but retries fire every few seconds, so
// the leader could have started somewhat earlier. This bounds how far back a "most recent assistant
// message" is trusted as that leader's real answer, rather than an unrelated older reply left behind
// by a lock row that went stale because its invocation was killed mid-flight (e.g. by a redeploy)
// without ever reaching its own cleanup.
const TURN_LOCK_LEADER_GRACE_MS = 20_000;

// See migration 20260911013800_voice_turn_inflight.sql for why this exists: ElevenLabs retries a
// slow Custom LLM request every few seconds without cancelling the previous attempt, and each
// retry lands on a fresh edge function isolate — confirmed live, up to 8 concurrent invocations
// for a single greeting, each independently calling Anthropic and contending for the same
// rate-limit budget, making every one of them slower and provoking still more retries. Only the
// first request for a user's turn (the "leader") is allowed to actually call Anthropic; anything
// else arriving while that row exists is a retry of the same turn, not a new one.
async function claimTurnLock(supabase: any, userId: string): Promise<boolean> {
  await supabase
    .from('voice_turn_inflight')
    .delete()
    .eq('user_id', userId)
    .lt('started_at', new Date(Date.now() - TURN_LOCK_STALE_MS).toISOString());
  const { error } = await supabase.from('voice_turn_inflight').insert({ user_id: userId });
  return !error;
}

async function releaseTurnLock(supabase: any, userId: string): Promise<void> {
  await supabase.from('voice_turn_inflight').delete().eq('user_id', userId);
}

// Polls for the leader's row to disappear (it deletes its own lock in a `finally` once
// logConversation has written the real reply), then reads that reply back rather than generating
// a second one — gated to messages no older than TURN_LOCK_LEADER_GRACE_MS before this follower's
// own arrival, so a stale row from a killed invocation can't hand back an unrelated old reply.
async function waitForLeaderReply(supabase: any, userId: string, followerArrivedAt: number): Promise<string | null> {
  const deadline = Date.now() + TURN_LOCK_WAIT_MS;
  const notBefore = new Date(followerArrivedAt - TURN_LOCK_LEADER_GRACE_MS).toISOString();
  while (Date.now() < deadline) {
    const { data: lock } = await supabase
      .from('voice_turn_inflight')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!lock) {
      const { data } = await supabase
        .from('message')
        .select('content, at')
        .eq('user_id', userId)
        .eq('role', 'assistant')
        .neq('modality', APP_LINE_MODALITY)
        .gte('at', notBefore)
        .order('at', { ascending: false })
        .limit(1)
        .maybeSingle();
      console.log(`[voice-timing:server] follower: lock cleared, reply found=${!!data}`);
      return data?.content ?? null;
    }
    await new Promise((resolve) => setTimeout(resolve, TURN_LOCK_POLL_MS));
  }
  console.log('[voice-timing:server] follower: gave up waiting for leader');
  return null;
}

function sseChunk(id: string, model: string, delta: { role?: string; content?: string }, finishReason: string | null) {
  const payload = {
    id,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function resolveReplyBuffered(
  userId: string | null,
  userText: string,
  timezone: string | null,
  isFirstTurnOfCall: boolean,
): Promise<string> {
  if (!userId || userText.trim() === '') return NO_IDENTITY_REPLY;

  // TEMPORARY — voice-timing instrumentation. Remove once the slow phase is identified.
  const tTurn0 = Date.now();
  try {
    const { supabase, handlers, turnMessages, systemPrompt, askedAt, guardState, fallbackReply } = await prepareTurn(
      userId,
      userText,
      timezone,
      isFirstTurnOfCall,
    );
    console.log(`[voice-timing:server] runBrainTurn: starting, +${Date.now() - tTurn0}ms since resolveReplyBuffered began`);
    const result = await runBrainTurn({ systemPrompt, messages: turnMessages, handlers, callModel });
    console.log(`[voice-timing:server] runBrainTurn: done, +${Date.now() - tTurn0}ms total, ${result.toolCalls.length} tool call(s): ${result.toolCalls.map((t) => t.name).join(',')}`);
    const reply = guardReply(result.reply, guardState(), fallbackReply);
    const turnBlocks = withGuardedFinalText(result.messages.slice(turnMessages.length), reply);
    await logConversation(supabase, userId, userText, askedAt, reply, turnBlocks);
    console.log(`[voice-timing:server] resolveReplyBuffered: done, +${Date.now() - tTurn0}ms total`);
    return reply;
  } catch (err) {
    console.error('[brain-voice] error:', err);
    return VOICE_ERROR_REPLY;
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-mustle-secret') !== SHARED_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  const requestReceivedAt = Date.now();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON body' }), { status: 400 });
  }

  const { messages: incoming = [], stream = false, model = BRAIN_MODEL } = body;
  const { userId, timezone } = extractContext(incoming);
  const latestUser = [...incoming].reverse().find((m: any) => m?.role === 'user');
  const userText = typeof latestUser?.content === 'string' ? latestUser.content : '';
  const completionId = `mustle-${crypto.randomUUID()}`;
  // ElevenLabs sends this call's own growing transcript in `incoming` — one real (non-system)
  // turn present means this request is the first turn of a brand new call, regardless of how much
  // lifetime history this user has (see prepareTurn's comment on why that distinction matters).
  const isFirstTurnOfCall = incoming.filter((m: any) => m?.role === 'user' || m?.role === 'assistant').length <= 1;

  const needsLock = !!userId && userText.trim() !== '';
  const lockClient = needsLock ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY) : null;
  const isLeader = needsLock ? await claimTurnLock(lockClient, userId!) : true;
  if (needsLock) {
    console.log(`[voice-timing:server] turn lock: ${isLeader ? 'LEADER' : 'FOLLOWER'} @${requestReceivedAt}`);
  }

  const jsonReply = (content: string) =>
    new Response(
      JSON.stringify({
        id: completionId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
      }),
      { headers: { 'content-type': 'application/json' } },
    );

  const singleChunkStream = (content: string) =>
    new Response(
      new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(sseChunk(completionId, model, { role: 'assistant', content }, null)));
          controller.enqueue(encoder.encode(sseChunk(completionId, model, {}, 'stop')));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } },
    );

  // This request is a retry of a turn another (still in-flight or just-finished) invocation is
  // already handling — see claimTurnLock's comment. Wait for that one's real answer instead of
  // generating a second one that would only contend with it.
  if (needsLock && !isLeader) {
    const leaderReply = sanitizeForSpeech(
      (await waitForLeaderReply(lockClient, userId!, requestReceivedAt)) ?? VOICE_ERROR_REPLY,
    );
    return stream ? singleChunkStream(leaderReply) : jsonReply(leaderReply);
  }

  if (!stream) {
    try {
      const reply = sanitizeForSpeech(
        stripSystemNote(await resolveReplyBuffered(userId, userText, timezone, isFirstTurnOfCall)),
      );
      return jsonReply(reply);
    } finally {
      if (needsLock) await releaseTurnLock(lockClient, userId!);
    }
  }

  const responseBody = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let sentFirstChunk = false;
      // ElevenLabs can abandon this connection (its own timeout) while runBrainTurn is still
      // waiting on a slow Anthropic reply — the controller is then already closed by the time a
      // delta or the final chunks arrive, and enqueue()/close() throw. Nothing downstream is
      // listening at that point, so swallowing here is correct; runBrainTurn keeps running to
      // completion regardless so logConversation below still records the real exchange.
      const enqueueSafely = (chunk: Uint8Array) => {
        try {
          controller.enqueue(chunk);
        } catch (err) {
          console.error('[brain-voice] stream enqueue after client disconnect:', err instanceof Error ? err.message : err);
        }
      };
      const send = (content: string) => {
        const delta = sentFirstChunk ? { content } : { role: 'assistant', content };
        sentFirstChunk = true;
        enqueueSafely(encoder.encode(sseChunk(completionId, model, delta, null)));
      };

      // Deltas are flushed on CLAUSE boundaries, not as they arrive.
      //
      // sanitizeForSpeech used to run on each delta in isolation, and a delta boundary falls
      // wherever the model's tokenizer put it — so "62g" arriving as "62" then "g" was normalized
      // as two independent fragments, neither of which matches the unit pattern, and TTS said
      // "sixty-two gee". Confirmed live, and invisible to verbalize-for-speech.test.ts because
      // every case there is a whole string. The same split breaks "0.5%", "2400 cal/day" and every
      // other pattern that spans more than one token.
      //
      // Holding to a clause boundary guarantees any unit expression is whole before it is
      // normalized, since none of them contain sentence punctuation. MAX_HOLD_CHARS is the safety
      // valve for a model that streams a long run without punctuation; it snaps to a space and
      // refuses to leave a bare number behind, because "62 g" is exactly the split that hurts.
      const MAX_HOLD_CHARS = 90;
      let pending = '';
      let emittedAny = false;
      let activeGuard: (() => ClaimGuardState) | null = null;
      let droppedClaim = false;
      const spokenParts: string[] = [];
      const filterSystemNote = createSystemNoteFilter();

      const emitChunk = (chunk: string) => {
        if (!chunk) return;
        const visible = filterSystemNote(chunk);
        if (!visible) return;
        // The placeholder check now sees a whole clause rather than the first 24 characters, so
        // it no longer has to guess from a fragment — but it still only applies before anything
        // has been spoken, since a later "silence" is part of a real sentence.
        if (!emittedAny && isSilencePlaceholder(visible)) return;
        if (activeGuard && isUnbackedClaim(visible, activeGuard())) {
          droppedClaim = true;
          console.warn('[brain-voice] dropped unbacked claim:', visible.trim());
          return;
        }
        emittedAny = true;
        spokenParts.push(visible);
        send(sanitizeForSpeech(visible));
      };

      const takeFlushable = (force: boolean): string => {
        if (force) {
          const all = pending;
          pending = '';
          return all;
        }
        let cut = -1;
        for (let i = pending.length - 2; i >= 0; i--) {
          // Punctuation only counts as a boundary when whitespace follows it, so the decimal
          // point in "12.9%" and the period in "1.5 kg" are never mistaken for one.
          if (/[.!?,;:\n]/.test(pending[i]) && /\s/.test(pending[i + 1])) {
            cut = i + 1;
            break;
          }
        }
        if (cut === -1) {
          if (pending.length < MAX_HOLD_CHARS) return '';
          const space = pending.lastIndexOf(' ');
          if (space <= 0) return '';
          let head = pending.slice(0, space);
          const trailingNumber = head.match(/\s\d+(?:\.\d+)?$/);
          if (trailingNumber) head = head.slice(0, head.length - trailingNumber[0].length);
          if (!head) return '';
          pending = pending.slice(head.length);
          return head;
        }
        const head = pending.slice(0, cut);
        pending = pending.slice(cut);
        return head;
      };

      const flushGate = () => emitChunk(takeFlushable(true));

      // An empty completion is FATAL, not merely quiet. ElevenLabs treats a custom LLM that
      // streams no content as a generation failure: it terminates the conversation outright with
      // "custom_llm_error: LLM Cascade Error: Brain returned no response" and the client drops the
      // call. Confirmed live against the conversation records — status "failed", every time.
      //
      // Which means every turn the coach correctly stayed SILENT killed the session. Mid-rest the
      // app explicitly instructs it not to speak, the model obeyed and produced nothing (or a
      // placeholder this stream deliberately suppresses), and the call died for doing the right
      // thing. That is the reconnect loop in the logs, and it made staying quiet during rest
      // impossible by construction, however the prompt was worded.
      //
      // A single space satisfies the non-empty requirement and synthesises to nothing audible, so
      // silence stays silent and the conversation survives it.
      const ensureNonEmptyCompletion = () => {
        if (emittedAny) return;
        emittedAny = true;
        send(' ');
      };

      try {
        if (!userId || userText.trim() === '') {
          send(sanitizeForSpeech(NO_IDENTITY_REPLY));
        } else {
          try {
            const { supabase, handlers, turnMessages, systemPrompt, askedAt, guardState, fallbackReply } =
              await prepareTurn(userId, userText, timezone, isFirstTurnOfCall);
            activeGuard = guardState;
            const result = await runBrainTurn({
              systemPrompt,
              messages: turnMessages,
              handlers,
              callModel,
              onTextDelta: (delta) => {
                pending += delta;
                emitChunk(takeFlushable(false));
              },
            });
            flushGate();
            let loggedReply = result.reply;
            if (droppedClaim) {
              if (!emittedAny) {
                emittedAny = true;
                spokenParts.push(fallbackReply);
                send(sanitizeForSpeech(fallbackReply));
              }
              loggedReply = spokenParts.join('').trim();
            }
            ensureNonEmptyCompletion();
            const turnBlocks = withGuardedFinalText(result.messages.slice(turnMessages.length), loggedReply);
            await logConversation(supabase, userId, userText, askedAt, loggedReply, turnBlocks);
          } catch (err) {
            console.error('[brain-voice] error:', err);
            pending = '';
            send(sanitizeForSpeech(VOICE_ERROR_REPLY));
          }
        }
      } finally {
        flushGate();
        ensureNonEmptyCompletion();
        if (needsLock) await releaseTurnLock(lockClient, userId!);
      }

      enqueueSafely(encoder.encode(sseChunk(completionId, model, {}, 'stop')));
      enqueueSafely(encoder.encode('data: [DONE]\n\n'));
      try {
        controller.close();
      } catch (err) {
        console.error('[brain-voice] stream close after client disconnect:', err instanceof Error ? err.message : err);
      }
    },
  });

  return new Response(responseBody, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
  });
});
