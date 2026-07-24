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
import { createHandlers } from './handlers.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SECRET_KEY')!;
const MODEL = Deno.env.get('BRAIN_MODEL') ?? 'claude-haiku-4-5';

const SYSTEM_PROMPT = `You are the Mustle coach. One input: the user talks to you — by voice, \
text, image, Live Photo, or file. You are the only actor: from the user's goals you generate a \
training plan and a coupled nutrition plan, mutate both through conversation, and log food, \
workouts, and check-ins silently from what the user tells you. Screens only ever display what \
you know — the user never enters data directly.

Rules:
- Always call read_state first to see the user's current plan, targets, injuries, and recent \
logs before proposing or changing anything.
- Injuries are a hard constraint. generate_training_plan and update_training_plan are checked \
against active injuries automatically — if rejected, revise the plan using the reason given and \
call the tool again. Never tell the user a plan is ready until the tool call succeeds.
- When the user's goal changes, call BOTH update_training_plan and update_nutrition_targets — \
they move together.
- v1 scope: training plans and nutrition targets are IN. Auto-progression, periodization, and \
meal-level suggestions are OUT — don't offer them.
- Keep replies short and conversational, like a coach texting back, not a report.`;

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
    const { userId, message, modality = 'text' } = await req.json();
    if (!userId || !message) {
      return new Response(JSON.stringify({ error: 'userId and message are required' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    const handlers = createHandlers(supabase, userId);

    const { data: history, error: historyError } = await supabase
      .from('message')
      .select('role,content')
      .eq('user_id', userId)
      .order('at', { ascending: false })
      .limit(20);
    if (historyError) throw new Error(`message fetch: ${historyError.message}`);

    const priorMessages = (history ?? [])
      .reverse()
      .map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const messages = [...priorMessages, { role: 'user', content: message }];

    const result = await runBrainTurn({ systemPrompt: SYSTEM_PROMPT, messages, handlers, callModel });

    const { error: logError } = await supabase.from('message').insert([
      { user_id: userId, role: 'user', content: message, modality },
      { user_id: userId, role: 'assistant', content: result.reply, modality: 'text' },
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
