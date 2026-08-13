// The coaching brain — Claude with tool use, gated by injury-validator. See
// docs/coaching-brain.md for the product contract this implements.
//
// Request shape here is an INTERNAL/testing format ({ userId, message, modality }), not what
// ElevenLabs' Custom LLM needs. Custom LLM requires an OpenAI-compatible /chat/completions
// endpoint — that translation layer (this function speaks two protocols: OpenAI in from
// ElevenLabs, Anthropic out to Claude) is a deliberately separate next step, once this core
// loop is proven against the live project.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { BRAIN_TOOLS } from '../_shared/brain-tools.ts';
import { runBrainTurn, type CallModel } from '../_shared/brain-orchestrator.ts';
import { EXERCISE_CATALOG } from '../_shared/exercise-catalog.ts';
import { replayHistory } from '../_shared/replay-history.ts';
import { createHandlers } from './handlers.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODEL = Deno.env.get('BRAIN_MODEL') ?? 'claude-haiku-4-5';

const CATALOG_NAMES = EXERCISE_CATALOG.map((e) => e.name).join(', ');

const SYSTEM_PROMPT = `You are the Mustle coach. One input: the user talks to you — by voice, \
text, image, Live Photo, or file. You are the only actor: from the user's goals you generate a \
training plan and a coupled nutrition plan, mutate both through conversation, and log food, \
workouts, and check-ins silently from what the user tells you. Screens only ever display what \
you know — the user never enters data directly.

Rules:
- Always call read_state first to see the user's current plan, targets, injuries, and recent \
logs before proposing or changing anything.
- generate_training_plan and update_training_plan only accept exercises from this exact catalog \
— use these names verbatim, character for character, never a close variant or synonym: \
${CATALOG_NAMES}.
- Injuries are a hard constraint. generate_training_plan and update_training_plan are checked \
against active injuries automatically — if rejected, revise the plan using the reason given and \
call the tool again. Never tell the user a plan is ready until the tool call succeeds.
- When the user's goal changes, call BOTH update_training_plan and update_nutrition_targets — \
they move together.
- generate_nutrition_targets/update_nutrition_targets require goal to be exactly cut, bulk, \
recomp, or maintain — but people rarely answer in those words. Infer the closest match from \
whatever they actually said ("get fit", "feel stronger", "look better" → maintain or recomp, \
judge from context) and proceed. Only ask a clarifying question when the answer is genuinely \
ambiguous between opposite paths (e.g. unclear whether they want to lose weight or gain \
muscle) — never stall a plan on a classification call you can reasonably make yourself, \
especially right after onboarding, where there is no next turn to catch a follow-up question.
- v1 scope: training plans and nutrition targets are IN. Auto-progression, periodization, and \
meal-level suggestions are OUT — don't offer them.
- Keep replies to 1-2 short sentences, like a coach texting back — never a report, never a \
bulleted summary of everything that just happened.
- Never use markdown (no **bold**, no bullet points, no headers). This is displayed as plain \
text, not rendered chat formatting.`;

const callModel: CallModel = async (messages, system) => {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages,
      tools: BRAIN_TOOLS,
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { stop_reason: data.stop_reason, content: data.content };
};

Deno.serve(async (req) => {
  try {
    const { userId, message, modality = 'text', hidden = false } = await req.json();
    if (!userId || !message) {
      return new Response(JSON.stringify({ error: 'userId and message are required' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    const handlers = createHandlers(supabase, userId);

    const { data: history, error: historyError } = await supabase
      .from('message')
      .select('role,content,blocks')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      // Rows written before turns were stamped explicitly share one timestamp per turn; ordering
      // by role too keeps the question ahead of its answer once this newest-first list is reversed.
      .order('role', { ascending: true })
      .limit(20);
    if (historyError) throw new Error(`message fetch: ${historyError.message}`);

    const priorMessages = replayHistory((history ?? []).reverse());

    const messages = [...priorMessages, { role: 'user', content: message }];

    const askedAt = new Date();
    const result = await runBrainTurn({ systemPrompt: SYSTEM_PROMPT, messages, handlers, callModel });

    const turnBlocks = result.messages.slice(messages.length);

    // Both rows default to now(), which for a single insert is one identical timestamp — leaving
    // the order of a question and its answer undefined, so history replays the reply first and the
    // model re-answers the previous turn. Stamping them explicitly is what keeps the turn ordered.
    const repliedAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));

    // hidden marks a scaffolding exchange the app fired on its own (e.g. the once-a-day Home
    // greeting), not something the user actually said — kept out of the visible chat transcript
    // (see useHomeChat's query) but still real history the model reads back on later turns, and
    // the assistant's reply still surfaces wherever the caller wants it (e.g. Home's headline).
    const { error: logError } = await supabase.from('message').insert([
      { user_id: userId, role: 'user', content: message, modality, hidden, at: askedAt.toISOString() },
      {
        user_id: userId,
        role: 'assistant',
        content: result.reply,
        modality: 'text',
        hidden,
        blocks: turnBlocks.length > 0 ? turnBlocks : null,
        at: repliedAt.toISOString(),
      },
    ]);
    if (logError) console.error('[brain] failed to log conversation:', logError.message);

    return new Response(
      JSON.stringify({ reply: result.reply, toolCalls: result.toolCalls.map((t) => t.name) }),
      { headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    console.error('[brain] error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
