export const SYSTEM_CUE_PREFIX = '[[SYSTEM_CUE]]';

// Keep this map's keys in sync with the cue names ActiveSessionScreen.tsx's triggerCueRef fires
// (session_start, set_logged, rest_final_countdown, rest_over, silence_after_rest). Rewriting the
// raw marker into a bracketed instruction here means the model never sees the literal
// "[[SYSTEM_CUE]] <name>" text at all, closing the leak that a prompt instruction alone couldn't
// structurally guarantee.
//
// A cue arrives as a *user* turn, so the agent always answers one. That makes cues the wrong
// tool for "stay quiet" — anything telling the agent to hold off is sent from the screen as a
// contextual update instead (see ActiveSessionScreen's rest-start briefing), which reaches the
// agent without demanding a reply.
const SYSTEM_CUE_INSTRUCTIONS: Record<string, string> = {
  session_start:
    '[System note: greet the user briefly, name the current exercise, and confirm the target ' +
    'weight and reps before they begin — one or two sentences, do not over-explain.]',
  set_logged:
    '[System note: confirm in one short line what was just logged, using the live session state ' +
    'block, then say rest has started. Do NOT ask them anything, do not invite a reply, and do ' +
    'not tell them to start the next set — a rest timer is now running on screen and you will be ' +
    'told when it ends. Stay silent after this one line until then.]',
  rest_final_countdown:
    '[System note: give a short heads-up that rest is almost over — a couple words, not a full ' +
    'countdown read aloud.]',
  rest_over:
    '[System note: tell them it is time for the next set, naming it, using the live session state ' +
    'block.]',
  silence_after_rest:
    '[System note: rest finished a while ago and they have not started the next set. ONE short ' +
    'check-in, at most a handful of words. Never send a second one this rest period, and never ' +
    'repeat the same phrasing.]',
};

export function resolveTurnText(userText: string): string {
  if (!userText.startsWith(SYSTEM_CUE_PREFIX)) return userText;
  const cue = userText.slice(SYSTEM_CUE_PREFIX.length).trim();
  return SYSTEM_CUE_INSTRUCTIONS[cue] ?? '[System note: continue the conversation naturally.]';
}
