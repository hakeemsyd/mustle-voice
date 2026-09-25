import { createClient } from 'npm:@supabase/supabase-js@2';
import { runBrainTurn } from '../_shared/brain-orchestrator.ts';
import { APP_LINE_MODALITY, replayHistory } from '../_shared/replay-history.ts';
import { dropLeadingConcession, dropSelfCorrection } from '../_shared/humanize.ts';
import { buildSystemPrompt, callModel, MESSAGE_HISTORY_LIMIT } from '../_shared/brain-config.ts';
import { buildContextBlock, startOfLocalDayUtc } from '../_shared/brain-context.ts';
import { createHandlers, logSetFromServer, resolveDispute, undoLockFor } from '../_shared/brain-handlers.ts';
import { describeDisputeOutcome, detectSetCountDispute } from '../_shared/set-dispute.ts';
import { stripSystemNote } from '../_shared/strip-system-note.ts';
import { scrubInternalLanguage } from '../_shared/scrub-internal.ts';
import {
  describeCueFacts,
  describeResumedStart,
  describeTypedTurnSetOutcome,
  describeUnconfirmedLog,
  isLiveStrengthSession,
  resolveTurnSetOutcome,
  TURN_NOTE_HEADER,
  type TurnSetOutcome,
} from '../_shared/turn-set-outcome.ts';
import { claimFallback, guardClaims, trackToolOutcomes, withGuardedFinalText } from '../_shared/claim-guard.ts';
import { contextHasInjuryGate } from '../_shared/injury-context.ts';
import { looksLikeFinishedSetReport } from '../_shared/set-report.ts';
import { SYSTEM_CUE_PREFIX } from '../_shared/system-cue.ts';
import {
  buildLiveSessionSnapshot,
  describeLiveSessionSnapshot,
  LIVE_STATE_MAX_AGE_MS,
} from '../_shared/live-session-format.ts';

const SET_CONFIRMING_CUES = new Set(['set_logged', 'exercise_advanced']);
const SESSION_START_CUE = 'session_start';

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
      hideReply,
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
    const messageText = typeof message === 'string' ? message : '';
    const cueName = messageText.startsWith(SYSTEM_CUE_PREFIX) ? messageText.slice(SYSTEM_CUE_PREFIX.length).trim() : null;
    const liveBlockText = typeof liveSessionState === 'string' ? liveSessionState : '';
    const sentFromWorkoutScreen = liveBlockText.length > 0;

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
        .select('role,content,blocks,hidden,greeting_key,modality,at')
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

    let [{ data: history, error: historyError }, contextBlock, { data: liveRow }, { data: unitsRow }] = await Promise.all([
      fetchHistory(),
      buildContextBlock(supabase, userId, timezone, typeof message === 'string' ? message : null),
      supabase.from('live_session_state').select('state, updated_at').eq('user_id', userId).maybeSingle(),
      supabase.from('profile').select('unit_prefs').eq('user_id', userId).maybeSingle(),
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

    const liveRowFresh = !!liveRow && Date.now() - new Date(liveRow.updated_at).getTime() < LIVE_STATE_MAX_AGE_MS;
    const sessionStartedAt = liveRowFresh ? (liveRow!.state as any)?.startedAt : null;
    const turnUnits = unitsRow?.unit_prefs === 'imperial' ? 'imperial' : 'metric';
    const dispute = cueName === null && liveRowFresh ? detectSetCountDispute(messageText, liveRow!.state) : null;
    const disputeResolution = dispute ? await resolveDispute(supabase, userId, dispute) : null;
    let currentLiveState = liveRowFresh ? liveRow!.state : null;
    if (disputeResolution === 'undone') {
      const { data: refreshed } = await supabase
        .from('live_session_state')
        .select('state')
        .eq('user_id', userId)
        .maybeSingle();
      if (refreshed) currentLiveState = refreshed.state;
    }
    if (dispute) {
      console.log(`[brain] set-count dispute on ${dispute.exerciseName}: ${dispute.done} -> ${dispute.targetDone}, ${disputeResolution}`);
    }
    const liveSnapshot = currentLiveState && !isDailyGreeting ? buildLiveSessionSnapshot(currentLiveState) : null;
    const turnLiveBlock =
      liveSnapshot && (disputeResolution === 'undone' || !sentFromWorkoutScreen)
        ? describeLiveSessionSnapshot(liveSnapshot, turnUnits)
        : liveBlockText;
    const liveStrengthSession =
      turnLiveBlock.includes('- Current exercise:') && !/Status: finished/.test(turnLiveBlock);
    const restActive = /Status: resting/.test(turnLiveBlock);

    let chatSetOutcome: TurnSetOutcome | null = null;
    if (cueName === null && !dispute && !sentFromWorkoutScreen && isLiveStrengthSession(liveSnapshot)) {
      const lastCoachRow = (history ?? []).find(
        (m: any) => m.role === 'assistant' && !m.greeting_key && m.modality !== APP_LINE_MODALITY,
      );
      chatSetOutcome = resolveTurnSetOutcome({
        userText: messageText,
        snapshot: liveSnapshot,
        units: turnUnits,
        lastCoachMessage: lastCoachRow ? { content: String(lastCoachRow.content ?? ''), at: lastCoachRow.at ?? null } : null,
        recentUserMessages: (history ?? [])
          .filter((m: any) => m.role === 'user' && !m.hidden && !String(m.content ?? '').startsWith(SYSTEM_CUE_PREFIX))
          .slice(0, 3)
          .map((m: any) => ({ content: String(m.content ?? ''), at: m.at ?? null })),
        holdsMissingWeight: true,
        appliesRestatementRule: true,
        confirmsBareReps: true,
        typed: modality !== 'voice',
      });
      if (chatSetOutcome?.kind === 'logged' && chatSetOutcome.set) {
        const landed = await logSetFromServer(supabase, userId, chatSetOutcome.set, messageText);
        if (!landed) chatSetOutcome = { kind: 'not_logged', note: describeUnconfirmedLog() };
      }
    }

    const tracked = trackToolOutcomes(
      createHandlers(supabase, userId, timezone, {
        currentUserText: message,
        undoLock: undoLockFor(disputeResolution),
      }),
    );
    const handlers = tracked.handlers;
    const scopedHistory =
      cueName === SESSION_START_CUE || isDailyGreeting
        ? []
        : sentFromWorkoutScreen && liveStrengthSession && typeof sessionStartedAt === 'string'
          ? (history ?? []).filter((m: any) => !m.at || m.at >= sessionStartedAt)
          : (history ?? []);
    const priorMessages = replayHistory(scopedHistory.slice().reverse());

    const userContent = hasAttachment
      ? [
          { type: 'image', source: { type: 'url', url: attachmentUrl } },
          { type: 'text', text: message ? message : 'What do you see here?' },
        ]
      : message;
    const messages = [...priorMessages, { role: 'user', content: userContent }];

    const typedSetNote =
      dispute && disputeResolution
        ? describeDisputeOutcome(dispute, disputeResolution, TURN_NOTE_HEADER, liveSnapshot ? liveSnapshot.status === 'resting' : null)
        : chatSetOutcome
          ? chatSetOutcome.note
          : liveStrengthSession && cueName === null
            ? describeTypedTurnSetOutcome(restActive)
            : null;
    const resumeNote = cueName === SESSION_START_CUE ? describeResumedStart(liveSnapshot, turnUnits) : null;
    const cueFacts = describeCueFacts(cueName, liveSnapshot, turnUnits);
    const fullContextBlock = [contextBlock, turnLiveBlock || null, typedSetNote, resumeNote, cueFacts]
      .filter(Boolean)
      .join('\n\n');
    const systemPrompt = buildSystemPrompt((history ?? []).length > 0, fullContextBlock, 'text', isDailyGreeting);

    const { error: askedLogError } = await supabase.from('message').insert({
      user_id: userId,
      role: 'user',
      content: message,
      modality,
      hidden,
      attachment_url: hasAttachment ? (attachmentPath ?? attachmentUrl) : null,
      greeting_key: isDailyGreeting ? (greetingKey ?? 'greeting') : null,
      at: askedAt.toISOString(),
    });
    if (askedLogError) console.error('[brain] failed to log the user turn:', askedLogError.message);

    const result = await runBrainTurn({ systemPrompt, messages, handlers, callModel });

    const injuryOnFile = contextHasInjuryGate(fullContextBlock);
    const guarded = guardClaims(result.reply, {
      liveSession: liveStrengthSession,
      injuryOnFile,
      setLoggedThisTurn: (cueName !== null && SET_CONFIRMING_CUES.has(cueName)) || chatSetOutcome?.kind === 'logged',
      restActive,
      actionSucceededThisTurn: tracked.outcomes.actionSucceeded || disputeResolution === 'undone',
    });
    if (guarded.dropped.length > 0) console.warn('[brain] dropped unbacked claims:', guarded.dropped.join(' | '));
    const guardedReply =
      guarded.dropped.length === 0
        ? result.reply
        : guarded.text ||
          claimFallback(liveStrengthSession, cueName === null && looksLikeFinishedSetReport(messageText), injuryOnFile);

    const turnBlocks =
      guarded.dropped.length === 0
        ? result.messages.slice(messages.length)
        : withGuardedFinalText(result.messages.slice(messages.length), guardedReply);

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

    const reply = scrubInternalLanguage(dropSelfCorrection(dropLeadingConcession(stripSystemNote(guardedReply))));

    const { error: logError } = await supabase.from('message').insert({
      user_id: userId,
      role: 'assistant',
      content: reply,
      modality: 'text',
      hidden: hideReply ?? (hidden && cueName === null),
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
