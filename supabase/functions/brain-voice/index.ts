import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBrainTurn } from '../_shared/brain-orchestrator.ts';
import { replayHistory } from '../_shared/replay-history.ts';
import {
  buildSystemPrompt,
  createCallModel,
  MODEL as BRAIN_MODEL,
  MESSAGE_HISTORY_LIMIT,
} from '../_shared/brain-config.ts';
import { buildContextBlock } from '../_shared/brain-context.ts';
import { createHandlers } from '../_shared/brain-handlers.ts';
import { VOICE_TOOLS } from '../_shared/brain-tools.ts';

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
const NO_IDENTITY_REPLY =
  "I couldn't identify your account for this conversation — please reopen the app and try again.";
const VOICE_ERROR_REPLY = "I'm having trouble reaching your plan right now — let's try again in a moment.";

function sanitizeForSpeech(text: string): string {
  return text.replace(/\s*[—–]\s*/g, ', ');
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

async function prepareTurn(userId: string, userText: string, timezone: string | null) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
  const handlers = createHandlers(supabase, userId, timezone);

  const askedAt = new Date();
  const [{ data: history, error: historyError }, contextBlock] = await Promise.all([
    supabase
      .from('message')
      .select('role,content,blocks')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      .order('role', { ascending: true })
      .limit(MESSAGE_HISTORY_LIMIT),
    buildContextBlock(supabase, userId, timezone),
  ]);
  if (historyError) throw new Error(`message fetch: ${historyError.message}`);

  const priorMessages = replayHistory((history ?? []).reverse());
  const turnMessages = [...priorMessages, { role: 'user', content: userText }];
  const systemPrompt = buildSystemPrompt((history ?? []).length > 0, contextBlock);

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
): Promise<string> {
  if (!userId || userText.trim() === '') return NO_IDENTITY_REPLY;

  try {
    const { supabase, handlers, turnMessages, systemPrompt, askedAt } = await prepareTurn(userId, userText, timezone);
    const result = await runBrainTurn({ systemPrompt, messages: turnMessages, handlers, callModel });
    const turnBlocks = result.messages.slice(turnMessages.length);
    await logConversation(supabase, userId, userText, askedAt, result.reply, turnBlocks);
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

  if (!stream) {
    const reply = sanitizeForSpeech(await resolveReplyBuffered(userId, userText, timezone));
    return new Response(
      JSON.stringify({
        id: completionId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
      }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  const responseBody = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let sentFirstChunk = false;
      const send = (content: string) => {
        const delta = sentFirstChunk ? { content } : { role: 'assistant', content };
        sentFirstChunk = true;
        controller.enqueue(encoder.encode(sseChunk(completionId, model, delta, null)));
      };

      if (!userId || userText.trim() === '') {
        send(sanitizeForSpeech(NO_IDENTITY_REPLY));
      } else {
        try {
          const { supabase, handlers, turnMessages, systemPrompt, askedAt } = await prepareTurn(
            userId,
            userText,
            timezone,
          );
          const result = await runBrainTurn({
            systemPrompt,
            messages: turnMessages,
            handlers,
            callModel,
            onTextDelta: (delta) => send(sanitizeForSpeech(delta)),
          });
          const turnBlocks = result.messages.slice(turnMessages.length);
          await logConversation(supabase, userId, userText, askedAt, result.reply, turnBlocks);
        } catch (err) {
          console.error('[brain-voice] error:', err);
          send(sanitizeForSpeech(VOICE_ERROR_REPLY));
        }
      }

      controller.enqueue(encoder.encode(sseChunk(completionId, model, {}, 'stop')));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(responseBody, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
  });
});
