import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBrainTurn } from '../_shared/brain-orchestrator.ts';
import { replayHistory } from '../_shared/replay-history.ts';
import { buildSystemPrompt, callModel, MESSAGE_HISTORY_LIMIT } from '../_shared/brain-config.ts';
import { buildContextBlock } from '../_shared/brain-context.ts';
import { createHandlers } from '../_shared/brain-handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    const {
      userId,
      message,
      modality = 'text',
      hidden = false,
      liveSessionState,
      timezone,
      attachmentUrl,
      isDailyGreeting = false,
    } = await req.json();
    const hasAttachment = modality === 'image' && typeof attachmentUrl === 'string' && attachmentUrl.length > 0;
    if (!userId || (!message && !hasAttachment)) {
      return new Response(JSON.stringify({ error: 'userId and message are required' }), { status: 400 });
    }

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

    const userContent = hasAttachment
      ? [
          { type: 'image', source: { type: 'url', url: attachmentUrl } },
          { type: 'text', text: message ? message : 'What do you see here?' },
        ]
      : message;
    const messages = [...priorMessages, { role: 'user', content: userContent }];

    const fullContextBlock =
      typeof liveSessionState === 'string' && liveSessionState.length > 0
        ? `${contextBlock}\n\n${liveSessionState}`
        : contextBlock;
    const systemPrompt = buildSystemPrompt((history ?? []).length > 0, fullContextBlock, 'text', isDailyGreeting);
    const result = await runBrainTurn({ systemPrompt, messages, handlers, callModel });

    const turnBlocks = result.messages.slice(messages.length);

    const repliedAt = new Date(Math.max(Date.now(), askedAt.getTime() + 1));

    const CARD_TOOL_NAMES = new Set([
      'show_plan_breakdown',
      'show_daily_workout',
      'show_nutrition_summary',
      'show_progress_report',
      'show_readiness',
      'show_top_lifts',
      'show_previous_workout',
    ]);
    const cardCall = result.toolCalls.find((t) => CARD_TOOL_NAMES.has(t.name) && t.result?.card);
    const card = cardCall?.result.card ?? null;

    const profileUpdateCall = result.toolCalls.find(
      (t) => t.name === 'update_profile' && t.result?.status === 'updated',
    );
    const updatedDisplayName = profileUpdateCall?.result.display_name ?? null;

    const { error: logError } = await supabase.from('message').insert([
      {
        user_id: userId,
        role: 'user',
        content: message,
        modality,
        hidden,
        attachment_url: hasAttachment ? attachmentUrl : null,
        at: askedAt.toISOString(),
      },
      {
        user_id: userId,
        role: 'assistant',
        content: result.reply,
        modality: 'text',
        hidden,
        blocks: turnBlocks.length > 0 ? turnBlocks : null,
        card,
        at: repliedAt.toISOString(),
      },
    ]);
    if (logError) console.error('[brain] failed to log conversation:', logError.message);

    return new Response(
      JSON.stringify({
        reply: result.reply,
        toolCalls: result.toolCalls.map((t) => t.name),
        card,
        updatedDisplayName,
      }),
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
