export const SYSTEM_CUE_PREFIX = '[[SYSTEM_CUE]]';

// Keep this map's keys in sync with the cue names ActiveSessionScreen.tsx's triggerCueRef fires
// (session_start, set_logged, exercise_advanced, rest_final_countdown, rest_over,
// silence_after_rest, silence_after_rest_final). Rewriting the
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
    '[System note: greet the user briefly. Using ONLY the live session state block below for the ' +
    'exercise name, target reps, and load — never an exercise mentioned earlier in this ' +
    'conversation, even from a previous session — name the current exercise and confirm its real ' +
    'target weight and reps before they begin. One or two sentences, do not over-explain. If no ' +
    'live session state block is present in this turn, say only a brief generic greeting and ask ' +
    'what they are working on today — never invent an exercise, rep count, or load to sound ' +
    'specific.]',
  set_logged:
    '[System note: confirm in one short line what was just logged, using the live session state ' +
    'block, then say rest has started. Do NOT ask them anything, do not invite a reply, and do ' +
    'not tell them to start the next set — a rest timer is now running on screen and you will be ' +
    'told when it ends. Stay silent after this one line until then.]',
  // Fires instead of set_logged specifically when the just-logged set was the exercise's last one
  // and another exercise follows — there is deliberately no rest timer between exercises (setup
  // for the next movement is its own break), so telling the model "rest started" here would be
  // false. Confirmed live: reusing set_logged's wording for this case had the coach announce a
  // rest period that never existed, then keep narrating the OLD exercise's rep scheme and set
  // count indefinitely since nothing ever told it a new exercise had started.
  exercise_advanced:
    '[System note: that was the last set of the exercise that just finished. Using the live ' +
    'session state block for the exact numbers, confirm what was just logged in one short line, ' +
    'then name the new current exercise and its real target sets/reps/load — never the numbers ' +
    'from the exercise that just ended. There is no rest timer between exercises, so do not say ' +
    'rest has started or tell them to wait; they can start whenever they are set up.]',
  rest_final_countdown:
    '[System note: give a short heads-up that rest is almost over — a couple words, not a full ' +
    'countdown read aloud.]',
  rest_over:
    '[System note: rest just ended — using the live session state block for the exact numbers, ' +
    'tell them it is time for set N (the next one) of this exercise, its target rep count, one ' +
    'short form cue for this specific movement, and a quick line of encouragement. Natural and ' +
    'brief, like a coach actually standing there — not a checklist read aloud, still just 1-2 ' +
    'sentences total.]',
  silence_after_rest:
    '[System note: rest finished a while ago and they have not started the next set. ONE short, ' +
    'casual check-in, at most a handful of words — you may get one more chance to nudge them ' +
    'after this if they still don\'t respond, so this one doesn\'t need to be the last word.]',
  silence_after_rest_final:
    '[System note: you already checked in once after rest ended and they still have not started ' +
    'the next set or replied. ONE more short nudge, a little more direct than the first, then stay ' +
    'quiet — no more check-ins this rest period regardless of what happens next. Do not repeat the ' +
    'same phrasing as before.]',
};

export function resolveTurnText(userText: string): string {
  if (!userText.startsWith(SYSTEM_CUE_PREFIX)) return userText;
  const cue = userText.slice(SYSTEM_CUE_PREFIX.length).trim();
  return SYSTEM_CUE_INSTRUCTIONS[cue] ?? '[System note: continue the conversation naturally.]';
}
