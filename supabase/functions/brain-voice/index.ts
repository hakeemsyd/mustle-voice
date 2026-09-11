import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBrainTurn } from '../_shared/brain-orchestrator.ts';
import { replayHistory } from '../_shared/replay-history.ts';
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

function sanitizeForSpeech(text: string): string {
  return verbalizeUnitsForSpeech(text)
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

async function prepareTurn(userId: string, userText: string, timezone: string | null, isFirstTurnOfCall: boolean) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
  const handlers = createHandlers(supabase, userId, timezone);

  const askedAt = new Date();
  const isSystemCue = userText.startsWith(SYSTEM_CUE_PREFIX);
  const isSessionStart =
    isSystemCue && userText.slice(SYSTEM_CUE_PREFIX.length).trim() === SESSION_START_CUE;
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
          .select('role,content,blocks,at')
          .eq('user_id', userId)
          .gte('at', startOfLocalDayUtc(timezone).toISOString())
          .order('at', { ascending: false })
          .order('role', { ascending: true })
          .limit(historyLimit);
  const [{ data: history, error: historyError }, contextBlock, { data: liveRow }] = await Promise.all([
    historyQuery,
    buildContextBlock(supabase, userId, timezone),
    supabase.from('live_session_state').select('state, updated_at').eq('user_id', userId).maybeSingle(),
  ]);
  console.log(`[voice-timing:server] prepareTurn: parallel fetch done, +${Date.now() - tPrepare0}ms`);
  if (historyError) throw new Error(`message fetch: ${historyError.message}`);

  const isLiveStateFresh = !!liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
  const liveSnapshot = isLiveStateFresh ? buildLiveSessionSnapshot(liveRow!.state) : null;
  const liveBlock = liveSnapshot ? describeLiveSessionSnapshot(liveSnapshot) : null;
  const fullContextBlock = liveBlock ? `${contextBlock}\n\n${liveBlock}` : contextBlock;

  // A workout's conversation must not leak into the next one. The app stamps live_session_state
  // with when the current session started; anything older belongs to a previous workout and reads
  // to the model as though it were still in progress — confirmed live: after force-quitting
  // mid-workout and starting over, the screen was back on set 1 while the coach insisted it was
  // set 3, because the killed session's turns were still being replayed. Scoping to the stamp keeps
  // the coach's memory exactly as long as the app's own: leaving the screen and coming back via
  // Home's in-progress card is the same session and remembers the weight, while killing the app
  // starts a new one and forgets what the UI forgot.
  const sessionStartedAt = isLiveStateFresh ? (liveRow!.state as any)?.startedAt : null;
  const scopedHistory =
    typeof sessionStartedAt === 'string'
      ? (history ?? []).filter((m: any) => !m.at || m.at >= sessionStartedAt)
      : (history ?? []);
  const priorMessages = replayHistory(scopedHistory.reverse());
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

  return { supabase, handlers, turnMessages, systemPrompt, askedAt };
}

async function logConversation(
  supabase: any,
  userId: string,
  userText: string,
  askedAt: Date,
  reply: string,
  turnBlocks: any[],
) {
  const repliedAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));
  const isSystemCue = userText.startsWith(SYSTEM_CUE_PREFIX);
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
      hidden: false,
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
    const { supabase, handlers, turnMessages, systemPrompt, askedAt } = await prepareTurn(
      userId,
      userText,
      timezone,
      isFirstTurnOfCall,
    );
    console.log(`[voice-timing:server] runBrainTurn: starting, +${Date.now() - tTurn0}ms since resolveReplyBuffered began`);
    const result = await runBrainTurn({ systemPrompt, messages: turnMessages, handlers, callModel });
    console.log(`[voice-timing:server] runBrainTurn: done, +${Date.now() - tTurn0}ms total, ${result.toolCalls.length} tool call(s): ${result.toolCalls.map((t) => t.name).join(',')}`);
    const turnBlocks = result.messages.slice(turnMessages.length);
    await logConversation(supabase, userId, userText, askedAt, result.reply, turnBlocks);
    console.log(`[voice-timing:server] resolveReplyBuffered: done, +${Date.now() - tTurn0}ms total`);
    return result.reply;
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
      const reply = sanitizeForSpeech(await resolveReplyBuffered(userId, userText, timezone, isFirstTurnOfCall));
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

      // A silence placeholder can only be recognised once enough of the reply has arrived to rule
      // out a real sentence, but deltas are streamed the moment they land — so the opening of every
      // reply is held back just long enough to tell the two apart. A placeholder is short by
      // nature, so anything past this length is real speech and streams from then on untouched;
      // the hold costs a few characters of latency, never a whole turn.
      const SILENCE_GATE_CHARS = 24;
      let gate: string | null = '';
      const sendGated = (content: string) => {
        if (gate === null) {
          send(content);
          return;
        }
        gate += content;
        if (gate.length <= SILENCE_GATE_CHARS) return;
        const held = gate;
        gate = null;
        send(held);
      };
      // Nothing ever reached the gate, or what did was only a placeholder: emit no text at all, so
      // ElevenLabs synthesises nothing instead of speaking the word out loud.
      const flushGate = () => {
        if (gate === null) return;
        const held = gate;
        gate = null;
        if (!isSilencePlaceholder(held)) send(held);
      };

      try {
        if (!userId || userText.trim() === '') {
          send(sanitizeForSpeech(NO_IDENTITY_REPLY));
        } else {
          try {
            const { supabase, handlers, turnMessages, systemPrompt, askedAt } = await prepareTurn(
              userId,
              userText,
              timezone,
              isFirstTurnOfCall,
            );
            const result = await runBrainTurn({
              systemPrompt,
              messages: turnMessages,
              handlers,
              callModel,
              onTextDelta: (delta) => sendGated(sanitizeForSpeech(delta)),
            });
            flushGate();
            const turnBlocks = result.messages.slice(turnMessages.length);
            await logConversation(supabase, userId, userText, askedAt, result.reply, turnBlocks);
          } catch (err) {
            console.error('[brain-voice] error:', err);
            gate = null;
            send(sanitizeForSpeech(VOICE_ERROR_REPLY));
          }
        }
      } finally {
        flushGate();
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
