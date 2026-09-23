import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBrainTurn } from '../_shared/brain-orchestrator.ts';
import { replayHistory } from '../_shared/replay-history.ts';
import { dropLeadingConcession, dropSelfCorrection } from '../_shared/humanize.ts';
import { buildSystemPrompt, callModel, MESSAGE_HISTORY_LIMIT } from '../_shared/brain-config.ts';
import { buildContextBlock, startOfLocalDayUtc } from '../_shared/brain-context.ts';
import { createHandlers } from '../_shared/brain-handlers.ts';
import { stripSystemNote } from '../_shared/strip-system-note.ts';
import { scrubInternalLanguage } from '../_shared/scrub-internal.ts';

// How far back a still-unfinished consultation stays readable. Long enough to cover leaving it
// overnight or for a few days, short enough that an abandoned one doesn't haunt a later signup.
const CONSULTATION_HISTORY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    const {
      userId,
      message,
      modality = 'text',
      hidden = false,
      hideReply = hidden,
      liveSessionState,
      timezone,
      attachmentUrl,
      // The PATH is what gets persisted; attachmentUrl is a short-lived signed URL that exists
      // only so the model can fetch the image on this turn. Storing the URL instead is what made
      // every chat photo expire after a week, with the dead link baked into the row.
      attachmentPath,
      isDailyGreeting = false,
      // Which session the greeting is about — stamped onto the assistant row so Home can tell a
      // still-accurate cached greeting from one the day has moved past. See the greeting_key
      // column comment. Only ever sent alongside isDailyGreeting.
      greetingKey = null,
    } = await req.json();
    const hasAttachment = modality === 'image' && typeof attachmentUrl === 'string' && attachmentUrl.length > 0;
    if (!userId || (!message && !hasAttachment)) {
      return new Response(JSON.stringify({ error: 'userId and message are required' }), { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    const handlers = createHandlers(supabase, userId, timezone, {
      currentUserText: message,
    });

    const askedAt = new Date();
    // Global Chat is a continuous scrollback with no session boundary of its own, so without a
    // cutoff the model (and, client-side, the visible transcript) would keep replaying whatever
    // was last said — even from days ago — as if it were still the same conversation. Damion
    // reported opening the app on a new day and finding "yesterday's conversation" still current.
    // Bounding history to the user's own local calendar day gives each day a fresh conversation
    // the same way a new voice call already gets one (see brain-voice's isFirstTurnOfCall) —
    // factual memory (plan, logs, nutrition) is untouched, since that comes from buildContextBlock
    // reading the database directly, never from this replayed turn history.
    // ...except mid-consultation. Before a first plan exists the conversation IS the consultation,
    // and Damion's requirement is that leaving partway through keeps the answers and resumes where
    // they left off. Confirmed broken: the coach acknowledged "that covers diet and equipment" and
    // never called note_consultation_covered, so nothing recorded it — and with history bounded to
    // today, coming back the next day lost both answers and re-asked them. Relying on the model to
    // write that bookkeeping is what failed; keeping the consultation readable until a plan exists
    // does not depend on it. The day boundary returns the moment there's a plan, which is when the
    // "yesterday's conversation is still current" complaint actually applies.
    const { data: activePlanRow } = await supabase
      .from('training_plan')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    const midConsultation = !activePlanRow;

    const fetchHistory = () =>
      supabase
        .from('message')
        .select('role,content,blocks')
        .eq('user_id', userId)
        .gte(
          'at',
          midConsultation
            ? new Date(Date.now() - CONSULTATION_HISTORY_LOOKBACK_MS).toISOString()
            : startOfLocalDayUtc(timezone).toISOString(),
        )
        .order('at', { ascending: false })
        .order('role', { ascending: true })
        .limit(MESSAGE_HISTORY_LIMIT);

    let [{ data: history, error: historyError }, contextBlock] = await Promise.all([
      fetchHistory(),
      buildContextBlock(supabase, userId, timezone, typeof message === 'string' ? message : null),
    ]);

    // Clock skew between Supabase edge nodes can reject a valid service-role token ("JWT issued at
    // future"), which threw away the whole turn. Retry, then continue without today's scrollback.
    if (historyError) {
      console.warn(`[brain] message fetch failed, retrying: ${historyError.message}`);
      ({ data: history, error: historyError } = await fetchHistory());
      if (historyError) {
        console.error(`[brain] message fetch failed twice, continuing without history: ${historyError.message}`);
        history = [];
      }
    }

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

    const { error: askedLogError } = await supabase.from('message').insert({
      user_id: userId,
      role: 'user',
      content: message,
      modality,
      hidden,
      attachment_url: hasAttachment ? (attachmentPath ?? attachmentUrl) : null,
      at: askedAt.toISOString(),
    });
    if (askedLogError) console.error('[brain] failed to log the user turn:', askedLogError.message);

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

    const reply = scrubInternalLanguage(dropSelfCorrection(dropLeadingConcession(stripSystemNote(result.reply))));

    const { error: logError } = await supabase.from('message').insert({
      user_id: userId,
      role: 'assistant',
      content: reply,
      modality: 'text',
      hidden: hideReply,
      blocks: turnBlocks.length > 0 ? turnBlocks : null,
      card,
      greeting_key: isDailyGreeting ? greetingKey : null,
      at: repliedAt.toISOString(),
    });
    if (logError) console.error('[brain] failed to log conversation:', logError.message);

    return new Response(
      JSON.stringify({
        reply,
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
