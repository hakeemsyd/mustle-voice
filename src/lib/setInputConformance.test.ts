import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideSetInput, NO_HOLDS, type EngineHolds, type EngineResult, type EngineState } from './setInputEngine.ts';
import { buildLiveSessionSnapshot } from '../../supabase/functions/_shared/live-session-format.ts';
import { lastLoggedSetOf, resolveTurnSetOutcome, type TurnSetOutcome } from '../../supabase/functions/_shared/turn-set-outcome.ts';
import { SET_PARSER_VERSION } from '../../supabase/functions/_shared/set-report.ts';

const DAMION_VOICE_LINES = [
  'Oh, the muscle? Yeah.',
  "All right, I'm doing it right now.",
  'Done.',
  'Done. That was easy.',
  'Done. You, you coming?',
  'Eight.',
  'Yeah. Yeah, this is...',
  "All right, let's go.",
  "We're in the workout right now.",
  "Let's go.",
  'I need you to follow along as I work out.',
  'All right. One.',
  'All right. One, two, three.',
  'Four.',
  'Four, five.',
  "Why did you move me to the rest time, to the rest screen? I'm not resting.",
  'You moved me to rest screen.',
  'Eight reps, but I was doing 75 pounds. You have four pound on the screen.',
  'Yeah, it was solid.',
  "I'm resting right now.",
  "Set two's already done. This is the rest time after set two.",
  "Why did you start? I'm s- I was still resting.",
  "You said to finish the rest, but it's not on the rest screen anymore.",
  'Good job.',
  "Okay, I'm ready.",
  'Yeah. Yeah, yeah, yeah.',
  'Okay. No.',
  'I got 10.',
  'Ten reps.',
  'All right, set one.',
  'And rest.',
  "It didn't.",
  'That was the end of set two. That was the end of set two.',
  'You pick it.',
  '45.',
  'Forty-five.',
  'Nothing.',
  'We have time.',
  "All right, I'm doing it now. Any tips for me?",
  "Okay, I'm done.",
  'Five.',
  "Ten push-up and then rest. Wow. All right. Now, okay, while I'm on resting, can you suggest what should I eat after the workout?",
  'Almost up.',
  'And the weight?',
  'I just dropped the dumbbell on my finger.',
  "It's like a sharp pain. Do you think I should still do the curl?",
  "I'll be back.",
  "Yeah, let's start. Let's go.",
  'All right. I said I just did 10 push-ups.',
  "The rest didn't start.",
  'I just told you, I just did ten.',
  "No, it didn't go to rest. I should be resting.",
  "All right, let's go. One, two, three, four, five, six, seven, eight, nine, ten. Done.",
  'Could you make sure my next rest is 90 seconds?',
  'Thank you.',
  'Thank you. It says that my next set is set three. How do I do the next set?',
  'No, it should be set two coming next. It says set three.',
  "I haven't done set two yet, and I'm on the rest. It's saying next is set three. Could you please fix that?",
  'Eight reps.',
  'Eight reps at 25 pounds.',
  'That was eight reps at 25.',
  'Done, eight reps.',
  'I did ten at forty.',
  'Forty pounds, ten reps.',
  'I said forty pounds not thirty nine point nine.',
  'It was ten reps not eight.',
  'Actually forty five pounds.',
  'Make my rest 100 seconds.',
  'Rest.',
  'Start the rest.',
  'Undo that.',
  'Done forty for eight.',
  "I'm going to do ten reps at forty.",
  "I'll try for eight.",
  "I'm gonna use 90 pounds for the rest of set.",
  "I'm gonna use 90 pounds for the rest of the sets.",
  'Using 90 pounds from here on.',
  "Let's go with 90 pounds for the next few.",
  "I'm staying at 90 pounds for the rest of this one.",
  "Let's use 12 reps this time.",
];

const VARIED_VOICE_LINES = [
  "Okay that's one set down, six reps.",
  'Yeah.',
  'Man that was heavy. Can I get a longer rest, like three minutes?',
  'How much time do I have?',
  "Alright, I'm ready.",
  'Six.',
  'Yes, that one is done.',
  'Got five on that one, the last rep was a grinder.',
  'I went up to 195 for this one, six reps, done.',
  'Wait, it was actually 190 not 195.',
  'No, I was just saying what I am about to do.',
  'Finished ten reps.',
  'Ten again, done.',
  'That was nine.',
  'Correct.',
  'Twelve reps at two seventy, done.',
  'Done with twelve.',
  "That's the last one, eleven reps.",
  'Done, ten.',
  "That's ten.",
  'Got all ten.',
  'Finished. Ten reps.',
  'Nailed all ten.',
  'Knocked out ten.',
  'Ten at sixty five, done.',
  'Sixty five for ten.',
  'Just finished ten reps at sixty.',
  'Wait 30 seconds.',
  'Sorry, I was talking to someone.',
  'Hold on, my phone rang.',
  'Rest time wrong, it should be 90 seconds.',
  'The rest should be 2 minutes.',
  'It was only 2 minutes rest.',
  'That was easy, next time seventy.',
  'Last week I did ten at fifty five.',
  'Only two more sets.',
  'My shoulder hurts at forty.',
  'Can I go up to forty five?',
  'Wait, that was only eight.',
  'Last set, nine reps.',
];

const SEP_29_VOICE_LINES = [
  'Okay. Start set three now.',
  'Start set three now.',
  "I'm ready for set three now.",
  'The screen is still on rest.',
  "At the end of the next set, I'm gonna go to 80 pound.",
  'Just 10 pounds.',
  'I remember I asked for 80 pounds, you still said 70.',
  'No, it is not done.',
  'Mm-hmm.',
  'I have to get a ride.',
  "I don't wanna go.",
  'All right, done.',
  'Go up to 80 pounds.',
  'Switch to 60 lb.',
  'Bump it to 90 pounds.',
  'Skip.',
  'Make it 80 pounds for the rest of these.',
];

const EXERCISES = [
  { id: 'a', exerciseId: 'x1', name: 'Incline Dumbbell Curl', sets: 4, repScheme: '10', loadScheme: '40 lb each' },
  { id: 'b', exerciseId: 'x2', name: 'Cable Tricep Pushdown', sets: 4, repScheme: '12', loadScheme: '55 lb' },
  { id: 'c', exerciseId: 'x3', name: 'Lat Pulldown', sets: 3, repScheme: '10', loadScheme: 'working weight' },
];

const NOW = Date.parse('2026-09-26T18:10:00Z');

interface Scenario {
  name: string;
  currentExerciseIndex: number;
  loggedSets: { weight: number | null; reps: number; at: number }[][];
  resting: boolean;
  restEndAt: number | null;
  restFinishedAt: number | null;
  coachAsked: boolean;
}

const SCENARIOS: Scenario[] = [
  { name: 'fresh, nothing logged', currentExerciseIndex: 0, loggedSets: [[], [], []], resting: false, restEndAt: null, restFinishedAt: null, coachAsked: false },
  {
    name: 'one set logged two minutes ago, rest over',
    currentExerciseIndex: 0,
    loggedSets: [[{ weight: 18.1, reps: 8, at: NOW - 120_000 }], [], []],
    resting: false,
    restEndAt: null,
    restFinishedAt: NOW - 20_000,
    coachAsked: false,
  },
  {
    name: 'resting 30 s after a set',
    currentExerciseIndex: 0,
    loggedSets: [[{ weight: 18.1, reps: 8, at: NOW - 30_000 }], [], []],
    resting: true,
    restEndAt: NOW + 60_000,
    restFinishedAt: null,
    coachAsked: false,
  },
  {
    name: 'the coach just asked how many reps',
    currentExerciseIndex: 0,
    loggedSets: [[{ weight: 18.1, reps: 8, at: NOW - 200_000 }], [], []],
    resting: false,
    restEndAt: null,
    restFinishedAt: NOW - 100_000,
    coachAsked: true,
  },
  {
    name: 'pushdowns up after the curls, transition rest running',
    currentExerciseIndex: 1,
    loggedSets: [[8, 10, 8, 10].map((reps, i) => ({ weight: 18.1, reps, at: NOW - 400_000 + i * 90_000 })), [], []],
    resting: true,
    restEndAt: NOW + 40_000,
    restFinishedAt: null,
    coachAsked: false,
  },
  { name: 'no weight on the plan', currentExerciseIndex: 2, loggedSets: [[], [], []], resting: false, restEndAt: null, restFinishedAt: null, coachAsked: false },
];

const phoneVerdict = (result: EngineResult, before: EngineHolds): string => {
  if (result.effects.some((e) => e.type === 'log')) return 'logged';
  if (result.effects.some((e) => e.type === 'amend')) return 'corrected';
  if (result.effects.some((e) => e.type === 'start_next_set')) return 'rest_ended';
  if (result.holds.weightCheck && result.holds.weightCheck !== before.weightCheck) return 'weight_check';
  if (result.holds.weight && result.holds.weight !== before.weight) return 'needs_weight';
  if (result.holds.done && result.holds.done !== before.done) return 'needs_confirmation';
  if (result.holds.details && result.holds.details !== before.details) return 'needs_details';
  if (result.effects.some((e) => e.type === 'remember_weight')) return 'stated_weight';
  return 'nothing';
};

const serverVerdict = (outcome: TurnSetOutcome | null): string => {
  switch (outcome?.kind) {
    case 'logged':
    case 'corrected':
    case 'rest_ended':
    case 'weight_check':
    case 'needs_weight':
    case 'needs_confirmation':
    case 'needs_details':
    case 'stated_weight':
      return outcome.kind;
    default:
      return 'nothing';
  }
};

const run = (scenario: Scenario, text: string) => {
  const holds: EngineHolds = scenario.coachAsked
    ? { ...NO_HOLDS, details: { exerciseIndex: scenario.currentExerciseIndex, at: NOW - 3_000 } }
    : NO_HOLDS;
  const phoneState: EngineState = {
    exercises: EXERCISES,
    currentExerciseIndex: scenario.currentExerciseIndex,
    loggedSets: scenario.loggedSets,
    resting: scenario.resting,
    restRemainingSec: scenario.restEndAt ? Math.round((scenario.restEndAt - NOW) / 1000) : null,
    restFinishedAt: scenario.restFinishedAt,
    statedWeight: null,
    units: 'imperial',
    lastCoachLine: scenario.coachAsked ? 'How many reps did you get?' : null,
    now: NOW,
  };
  const phone = decideSetInput(text, 'voice', phoneState, holds);

  const liveState = {
    setParser: SET_PARSER_VERSION,
    target: { type: 'strength', planSessionId: 'p' },
    focus: 'Arms',
    exercises: EXERCISES,
    currentExerciseIndex: scenario.currentExerciseIndex,
    loggedSets: scenario.loggedSets,
    resting: scenario.resting,
    restTargetSec: 90,
    restEndAt: scenario.restEndAt,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 600,
    statedWeight: null,
    restFinishedAt: scenario.restFinishedAt,
  };
  const server = resolveTurnSetOutcome({
    userText: text,
    snapshot: buildLiveSessionSnapshot(liveState as any),
    units: 'imperial',
    lastCoachMessage: scenario.coachAsked ? { content: 'How many reps did you get?', at: new Date(NOW - 3_000).toISOString() } : null,
    recentUserMessages: [],
    holdsMissingWeight: true,
    appliesRestatementRule: true,
    confirmsBareReps: true,
    parserVersion: SET_PARSER_VERSION,
    clientVersion: SET_PARSER_VERSION,
    lastSet: lastLoggedSetOf(liveState),
    now: NOW,
  });
  return { phone, server, phoneKind: phoneVerdict(phone, holds), serverKind: serverVerdict(server) };
};

test('phone and coach agree on every one of Damion\'s spoken lines, in every workout state', () => {
  const disagreements: string[] = [];
  for (const scenario of SCENARIOS) {
    for (const line of DAMION_VOICE_LINES) {
      const { phone, server, phoneKind, serverKind } = run(scenario, line);
      if (phoneKind !== serverKind) {
        disagreements.push(`[${scenario.name}] "${line}": phone=${phoneKind} coach=${serverKind}`);
        continue;
      }
      if (phoneKind === 'logged') {
        const log = phone.effects.find((e) => e.type === 'log') as any;
        if (log.weight !== server!.set!.weight || log.reps !== server!.set!.reps) {
          disagreements.push(`[${scenario.name}] "${line}": phone logged ${log.weight}x${log.reps}, coach told ${server!.set!.weight}x${server!.set!.reps}`);
        }
      }
      if (phoneKind === 'corrected') {
        const amend = phone.effects.find((e) => e.type === 'amend') as any;
        assert.deepEqual(
          { exerciseIndex: amend.exerciseIndex, setIndex: amend.setIndex, weight: amend.weight, reps: amend.reps },
          server!.amend,
          line,
        );
      }
    }
  }
  assert.deepEqual(disagreements, []);
});

test('phone and coach agree on the lines from Damion\'s 29 Sep run, in every workout state', () => {
  const disagreements: string[] = [];
  for (const scenario of SCENARIOS) {
    for (const line of SEP_29_VOICE_LINES) {
      const { phone, server, phoneKind, serverKind } = run(scenario, line);
      if (phoneKind !== serverKind) {
        disagreements.push(`[${scenario.name}] "${line}": phone=${phoneKind} coach=${serverKind}`);
        continue;
      }
      if (phoneKind === 'logged') {
        const log = phone.effects.find((e) => e.type === 'log') as any;
        if (log.weight !== server!.set!.weight || log.reps !== server!.set!.reps) {
          disagreements.push(`[${scenario.name}] "${line}": phone logged ${log.weight}x${log.reps}, coach told ${server!.set!.weight}x${server!.set!.reps}`);
        }
      }
    }
  }
  assert.deepEqual(disagreements, []);
});

test('phone and coach agree on varied spoken lines from other lifters, in every workout state', () => {
  const disagreements: string[] = [];
  for (const scenario of SCENARIOS) {
    for (const line of VARIED_VOICE_LINES) {
      const { phone, server, phoneKind, serverKind } = run(scenario, line);
      if (phoneKind !== serverKind) {
        disagreements.push(`[${scenario.name}] "${line}": phone=${phoneKind} coach=${serverKind}`);
        continue;
      }
      if (phoneKind === 'logged') {
        const log = phone.effects.find((e) => e.type === 'log') as any;
        if (log.weight !== server!.set!.weight || log.reps !== server!.set!.reps) {
          disagreements.push(`[${scenario.name}] "${line}": phone logged ${log.weight}x${log.reps}, coach told ${server!.set!.weight}x${server!.set!.reps}`);
        }
      }
    }
  }
  assert.deepEqual(disagreements, []);
});

test('spoken rest complaints and pauses never change a logged set', () => {
  for (const scenario of SCENARIOS) {
    for (const line of [
      'Wait 30 seconds.',
      'Rest time wrong, it should be 90 seconds.',
      'The rest should be 2 minutes.',
      'It was only 2 minutes rest.',
      'Sorry, I was talking to someone.',
      'Hold on, my phone rang.',
      'Last week I did ten at fifty five.',
      'That was easy, next time seventy.',
    ]) {
      const { phoneKind, serverKind } = run(scenario, line);
      assert.ok(!['logged', 'corrected'].includes(phoneKind), `[${scenario.name}] "${line}" phone=${phoneKind}`);
      assert.ok(!['logged', 'corrected'].includes(serverKind), `[${scenario.name}] "${line}" coach=${serverKind}`);
    }
  }
});

test('what the phone does with Damion\'s key spoken lines', () => {
  const kind = (scenario: number, line: string) => run(SCENARIOS[scenario], line).phoneKind;
  assert.equal(kind(0, 'Eight reps.'), 'needs_confirmation');
  assert.equal(kind(0, 'Eight reps at 25 pounds.'), 'needs_confirmation');
  assert.equal(kind(0, 'Done, eight reps.'), 'logged');
  assert.equal(kind(0, 'I did ten at forty.'), 'logged');
  assert.equal(kind(0, 'Done.'), 'needs_details');
  assert.equal(kind(0, "All right, let's go. One, two, three, four, five, six, seven, eight, nine, ten. Done."), 'needs_details');
  assert.equal(kind(0, 'All right. One, two, three.'), 'nothing');
  assert.equal(kind(0, 'Rest.'), 'nothing');
  assert.equal(kind(0, "I'm going to do ten reps at forty."), 'nothing');
  assert.equal(kind(1, 'I said forty pounds not thirty nine point nine.'), 'corrected');
  assert.equal(kind(1, 'It was ten reps not eight.'), 'corrected');
  assert.equal(kind(1, 'All right. I said I just did 10 push-ups.'), 'logged');
  assert.equal(kind(2, 'Done, eight reps.'), 'needs_confirmation', 'during rest a report waits for "Is that another set done?"');
  assert.equal(kind(2, 'That was eight reps at 25.'), 'needs_confirmation');
  assert.equal(kind(2, "Let's go."), 'rest_ended');
  assert.equal(kind(3, 'Eight.'), 'logged');
  assert.equal(kind(3, 'Five.'), 'logged');
  assert.equal(
    kind(4, 'Done, twelve reps.'),
    'logged',
    'first set of a new exercise during the transition rest: nothing on it to restate, so it logs first time',
  );
  assert.equal(
    kind(2, 'Done, twelve reps.'),
    'needs_confirmation',
    'same exercise with a set already on it: still ambiguous, still confirmed first',
  );
  assert.equal(kind(5, 'Done, ten reps.'), 'needs_weight');
  const pushdown = run(SCENARIOS[1], 'Done, ten reps.').phone.effects.find((e) => e.type === 'log') as any;
  assert.equal(pushdown.weight, 18.1, 'the reps-only report takes the weight on the card');
});

test('the coach is told to ask the one question the app is waiting on', () => {
  assert.equal(run(SCENARIOS[0], 'Eight reps.').server?.requiredAsk, 'Is that set done?');
  assert.equal(run(SCENARIOS[2], 'Done, eight reps.').server?.requiredAsk, 'Is that another set done?');
  assert.equal(run(SCENARIOS[0], 'Done.').server?.requiredAsk, 'How many reps did you get?');
  const rest = run(SCENARIOS[1], 'And rest.').server;
  assert.equal(rest?.kind, 'rest_request');
  assert.equal(rest?.requiredAsk, 'How many reps did you get?');
  assert.match(rest!.note, /did NOT start a rest timer/);
});
