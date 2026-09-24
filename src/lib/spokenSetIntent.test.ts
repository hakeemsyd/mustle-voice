import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySpokenSet, type SpokenSetIntent } from './spokenSetIntent';

const idle = { awaitingDetails: false };
const asked = { awaitingDetails: true };

const kindOf = (intent: SpokenSetIntent): string => intent.kind;

const expectIgnore = (text: string, ctx = idle, units: 'metric' | 'imperial' = 'imperial') =>
  assert.equal(kindOf(classifySpokenSet(text, units, ctx)), 'ignore', text);

const expectNeedsDetails = (text: string, ctx = idle, units: 'metric' | 'imperial' = 'imperial') =>
  assert.equal(kindOf(classifySpokenSet(text, units, ctx)), 'needs_details', text);

const expectLog = (
  text: string,
  set: { weight: number | null; reps: number; unit?: 'seconds' },
  ctx = idle,
  units: 'metric' | 'imperial' = 'imperial',
) => {
  const intent = classifySpokenSet(text, units, ctx);
  assert.equal(intent.kind, 'log', text);
  if (intent.kind === 'log') assert.deepEqual(intent.set, set, text);
};

const expectStatedWeight = (text: string, weight: number, ctx = idle) => {
  const intent = classifySpokenSet(text, 'imperial', ctx);
  assert.equal(intent.kind, 'stated_weight', text);
  if (intent.kind === 'stated_weight') assert.equal(intent.weight, weight, text);
};

test('counting reps out loud is never a set', () => {
  expectIgnore('One, two, three.');
  expectIgnore('Four, five.');
  expectIgnore('Six.');
  expectIgnore('7, 8');
  expectIgnore('one two three four five');
  expectIgnore('Nine, ten!');
  expectIgnore('4, 5, 6.');
});

test('counting is still ignored while the app is waiting on details', () => {
  expectIgnore('Four, five.', asked);
  expectIgnore('Six.', asked);
});

test('explicit completion with numbers logs', () => {
  expectLog('Set one done, 75 pounds, 8 reps.', { weight: 34, reps: 8 });
  expectLog('Done, 8 reps at 75 pounds.', { weight: 34, reps: 8 });
  expectLog('Finished, 8 reps.', { weight: null, reps: 8 });
  expectLog("That's it, 6 reps at 75 lb.", { weight: 34, reps: 6 });
  expectLog('Set complete, 10 reps.', { weight: null, reps: 10 });
});

test('a past-tense report logs without the word done', () => {
  expectLog('I got 8 reps.', { weight: null, reps: 8 });
  expectLog('I did 6 reps at 75 pounds.', { weight: 34, reps: 6 });
  expectLog('Hit 8 reps.', { weight: null, reps: 8 });
  expectLog('Only got 5 reps.', { weight: null, reps: 5 });
  expectLog('Knocked out 12 reps.', { weight: null, reps: 12 });
});

test('a set ordinal frames a report', () => {
  expectLog('Set 2, 8 reps.', { weight: null, reps: 8 });
  expectLog('Second set, 10 reps.', { weight: null, reps: 10 });
  expectLog('3rd set, 6 reps at 75 lb.', { weight: 34, reps: 6 });
});

test('an explicit weight and rep pair is a report on its own', () => {
  expectLog('75 pounds, 8 reps.', { weight: 34, reps: 8 });
  expectLog('8 reps at 75 pounds.', { weight: 34, reps: 8 });
  expectLog('60 kg 8 reps', { weight: 60, reps: 8 }, idle, 'metric');
});

test('stating the weight you are about to use never logs a set', () => {
  expectStatedWeight('75 pounds.', 34);
  expectStatedWeight("I'm using 75 pounds.", 34);
  expectIgnore("I'm going to do 75 pounds for 8 reps.");
  expectIgnore("Let's do 8 reps at 75 pounds.");
  expectIgnore("I'll try for 8 reps.");
  expectIgnore('This set I want 8 reps.');
  expectIgnore('Aiming for 8 reps at 75 lb.');
});

test('a completion claim with unreadable numbers asks instead of guessing', () => {
  expectNeedsDetails('Done.');
  expectNeedsDetails('Set one done.');
  expectNeedsDetails('That was it.');
  expectNeedsDetails('Finished that one.');
});

test('a vague past-tense remark is left to the coach rather than challenged', () => {
  expectIgnore('I got a few.');
  expectIgnore('I got through it.');
});

test('answering the pending question logs, with or without a weight', () => {
  expectLog('8 reps.', { weight: null, reps: 8 }, asked);
  expectLog('8 reps at 75 pounds.', { weight: 34, reps: 8 }, asked);
  expectLog('12 reps', { weight: null, reps: 12 }, asked);
});

test('a bare rep count with nothing pending is left to the coach', () => {
  expectIgnore('8 reps.');
  expectIgnore('12 reps');
});

test('a duration only logs while the current exercise is actually timed', () => {
  const onTimedExercise = { ...idle, timedExercise: true };
  expectLog('52 seconds.', { weight: null, reps: 52, unit: 'seconds' }, onTimedExercise);
  expectLog(
    'I held it for 45 seconds.',
    { weight: null, reps: 45, unit: 'seconds' },
    onTimedExercise,
  );
  expectLog('Done, 60 seconds.', { weight: null, reps: 60, unit: 'seconds' }, onTimedExercise);
});

test("a duration mentioned off a timed exercise never logs — Hakeem's exact live repro", () => {
  // Confirmed live: on Lat Pulldown (not timed), explaining the counting pace with "I just have
  // to count 30 seconds, so you are just going so fast" silently logged a 30-second timed set
  // and advanced the app to rest, with no report to the coach at all. The bug was that the
  // duration branch had no gate on the current exercise being timed — any "N seconds" anywhere
  // in a sentence matched, regardless of framing or exercise.
  expectIgnore('52 seconds.');
  expectIgnore('I held it for 45 seconds.');
  // "Done" is a real completion word even off a timed exercise — this correctly asks for
  // details rather than logging a fabricated 60-second hold on a rep-based exercise.
  expectNeedsDetails('Done, 60 seconds.');
  expectIgnore(
    'No, no. Not like this. You have to say, like, I just have to count 30 seconds. ' +
      'So you are just going so fast.',
  );
});

test('ordinary workout conversation never logs a set', () => {
  expectIgnore('How many sets are left?');
  expectIgnore("I've got about 1 more set, give me 2 minutes.");
  expectIgnore('That felt heavy.');
  expectIgnore('What weight should I use?');
  expectIgnore('Can you give me a form cue?');
  expectIgnore('Move me to the rest screen.');
  expectIgnore("Why did you move me to the rest time? I'm not resting.");
  expectIgnore('I need you to follow along as I work out.');
  expectIgnore('My shoulder is bothering me.');
});

test('units are honoured on the way in', () => {
  expectLog('Done, 75 pounds, 8 reps.', { weight: 34, reps: 8 }, idle, 'imperial');
  expectLog('Done, 75 lb, 8 reps.', { weight: 34, reps: 8 }, idle, 'metric');
  expectLog('Done, 60 kg, 8 reps.', { weight: 60, reps: 8 }, idle, 'imperial');
});

test("Damion's exact transcript produces no phantom set", () => {
  expectIgnore('All right. One, two, three.');
  expectIgnore('Four, five.');
  expectIgnore('Six.');
});

test("Damion's 2026-09-24 report: a finished set said without the word reps logs", () => {
  expectLog('All right. I said I just did 10 push-ups.', { weight: null, reps: 10 });
  expectLog('I just told you, I just did ten.', { weight: null, reps: 10 });
  expectLog('I just did 10.', { weight: null, reps: 10 });
  expectLog('Got 8.', { weight: null, reps: 8 });
  expectLog('Did 12 on that one.', { weight: null, reps: 12 });
  expectLog('Done, 12.', { weight: null, reps: 12 });
  expectLog('Set 2 done, 8.', { weight: null, reps: 8 });
  expectLog('10 push-ups done.', { weight: null, reps: 10 });
  expectLog('I did 10 with the 75s.', { weight: 34, reps: 10 });
  expectLog('Finished 8 at 75 pounds.', { weight: 34, reps: 8 });
});

test("Damion's 2026-09-24 report: a planned rep count never logs", () => {
  expectIgnore("I'll do about 10 reps.");
  expectIgnore("I'll do about 10.");
  expectIgnore('I want to do 10 reps.');
  expectIgnore('Should I do 10 reps?');
  expectIgnore('Going to go for 10.');
});

test('loose report phrasing that is not a finished set stays with the coach', () => {
  expectIgnore("I didn't get 10.");
  expectIgnore('I did 10 last time.');
  expectIgnore('Yesterday I got 8.');
  expectIgnore('Did I do 10?');
  expectIgnore('I did 3 sets.');
  expectIgnore('I got 2 more in me.');
  expectIgnore('I did 8, then 2 partials.');
  expectIgnore('I got 1.');
  expectNeedsDetails('Finished that one.');
  expectNeedsDetails('Done with this one.');
});

test('loose reps never land on a timed exercise', () => {
  const onTimedExercise = { ...idle, timedExercise: true };
  expectNeedsDetails('Done, 45.', onTimedExercise);
  expectIgnore('I did 10.', onTimedExercise);
});

test('typed input logs a plain count but never a plan or a question', () => {
  const typed = { ...idle, typed: true };
  expectLog('8 reps', { weight: null, reps: 8 }, typed);
  expectLog('60 8', { weight: 60, reps: 8 }, typed, 'metric');
  expectLog('75 lb 8', { weight: 34, reps: 8 }, typed);
  expectIgnore("I'll do about 10 reps", typed);
  expectIgnore('How about 10 reps?', typed);
  expectStatedWeight('75 pounds', 34, typed);
});

test('a spoken cardio duration logs on a timed exercise and is ignored off one', () => {
  assert.deepEqual(
    classifySpokenSet('done, 25 minutes', 'metric', { awaitingDetails: false, timedExercise: true }),
    { kind: 'log', set: { weight: null, reps: 1500, unit: 'seconds' } },
  );
  assert.equal(
    classifySpokenSet('give me 2 minutes', 'metric', { awaitingDetails: false }).kind,
    'ignore',
  );
});

test("iPhone smart punctuation: curly apostrophes read exactly like straight ones", () => {
  const typed = { ...idle, typed: true };
  expectIgnore("I\u2019ll do about 10 reps", typed);
  expectIgnore("I\u2019ll do about 10 reps.");
  expectIgnore("Let\u2019s do 8 reps at 75 pounds.");
  expectIgnore("I didn\u2019t get 10.");
  expectLog("That\u2019s it, 6 reps at 75 lb.", { weight: 34, reps: 6 });
});
