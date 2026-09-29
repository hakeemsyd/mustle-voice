import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customRestFor, describeRestRules } from './rest-length.ts';
import { parseRestChangeRequest } from './set-report.ts';

test('Damion\'s rest phrases map to the scope he asked for', () => {
  const resting = { resting: true };
  const training = { resting: false };
  assert.deepEqual(parseRestChangeRequest('Make it 90 seconds', resting), { kind: 'set', seconds: 90, scope: 'exercise' });
  assert.deepEqual(parseRestChangeRequest('make my rests 90 seconds', training), { kind: 'set', seconds: 90, scope: 'exercise' });
  assert.deepEqual(parseRestChangeRequest('Add 20 seconds', resting), { kind: 'extend', seconds: 20 });
  assert.deepEqual(parseRestChangeRequest('give me another minute', resting), { kind: 'extend', seconds: 60 });
  assert.deepEqual(parseRestChangeRequest('30 more seconds', resting), { kind: 'extend', seconds: 30 });
  assert.deepEqual(parseRestChangeRequest('Always use 90 seconds for this exercise', training), { kind: 'set', seconds: 90, scope: 'always' });
  assert.deepEqual(parseRestChangeRequest('always rest 2 minutes on bench', training), { kind: 'set', seconds: 120, scope: 'always' });
  assert.deepEqual(parseRestChangeRequest('make all my rests 90 seconds', training), { kind: 'set', seconds: 90, scope: 'workout' });
  assert.deepEqual(parseRestChangeRequest('90 second rests for every exercise', training), { kind: 'set', seconds: 90, scope: 'workout' });
  assert.deepEqual(parseRestChangeRequest('rest 2 minutes for the rest of the workout', training), { kind: 'set', seconds: 120, scope: 'workout' });
  assert.deepEqual(parseRestChangeRequest('just this rest, make it 2 minutes', resting), { kind: 'set', seconds: 120, scope: 'current' });
});

test('things that are not a rest change are left alone', () => {
  const resting = { resting: true };
  for (const text of ['rest was only 60 seconds', 'make it 30 seconds shorter', 'I held it 30 more seconds', 'how long is my rest?', '60 seconds', 'I need more rest', 'Make it 90 seconds']) {
    assert.equal(parseRestChangeRequest(text, text === 'Make it 90 seconds' ? { resting: false } : resting), null, text);
  }
  assert.equal(parseRestChangeRequest('Add 20 seconds', { resting: false }), null, 'nothing to extend and no rest named');
});

test('"make it 90 seconds" between sets changes the rest, unless the exercise is the timed one', () => {
  assert.deepEqual(
    parseRestChangeRequest('Make it 90 seconds', { resting: false, timedExercise: false }),
    { kind: 'set', seconds: 90, scope: 'exercise' },
    'no rest running on Front Squat still sets the rest, rather than the coach claiming it did',
  );
  assert.equal(
    parseRestChangeRequest('Make it 90 seconds', { resting: false, timedExercise: true }),
    null,
    'on a plank it is the hold they mean, not the rest',
  );
});

test('on a plank "make it ninety seconds" is the hold, and the app changes it without the model calling anything', async () => {
  const { parseHoldTargetRequest } = await import('./set-report.ts');
  assert.equal(parseHoldTargetRequest('Make it ninety seconds.'), 90);
  assert.equal(parseHoldTargetRequest('make it two minutes'), 120);
  assert.equal(parseHoldTargetRequest('set it to 45 seconds'), 45);
  assert.equal(parseHoldTargetRequest('Make my rest ninety seconds'), null, 'they named the rest, so it is a rest change');
  assert.equal(parseHoldTargetRequest('add 30 seconds'), null, 'extending a rest is not a hold target');
  assert.equal(parseHoldTargetRequest('how long is the hold?'), null, 'a question changes nothing');
  assert.equal(parseHoldTargetRequest('ninety seconds'), null, 'a bare duration on a plank is a set report, not an instruction');
});

test('on a timed hold the rest tool refuses "make it 90 seconds" (Hakeem, 30 Sep: Plank rest changed instead)', async () => {
  const { meansTheHoldNotTheRest } = await import('./brain-handlers.ts');
  assert.equal(
    meansTheHoldNotTheRest('Plank', 'Make it ninety seconds.'),
    true,
    'the model called adjust_rest_timer and the coach said "90 seconds for the rest of your Plank" while the card stayed 30-60s',
  );
  assert.equal(
    meansTheHoldNotTheRest('Plank', 'Make my rest ninety seconds'),
    false,
    'they named the rest, so a rest change on a plank still goes through',
  );
  assert.equal(meansTheHoldNotTheRest('Front Squat', 'Make it ninety seconds.'), false, 'not a timed exercise');
  assert.equal(meansTheHoldNotTheRest(null, 'Make it ninety seconds.'), false, 'no current exercise');
});

test('which rest length applies: this exercise, then every exercise, then the saved one', () => {
  const bench = { name: 'Bench Press', exerciseId: 'ex-bench' };
  const row = { name: 'Barbell Row', exerciseId: 'ex-row' };
  const saved = { 'ex-bench': 150 };
  assert.deepEqual(customRestFor(bench, { savedRestByExercise: saved }), { seconds: 150, source: 'saved' });
  assert.equal(customRestFor(row, { savedRestByExercise: saved }), null);
  assert.deepEqual(customRestFor(bench, { restOverrideSec: 60, savedRestByExercise: saved }), { seconds: 60, source: 'workout' });
  assert.deepEqual(
    customRestFor(bench, { restByExercise: { 'bench press': 90 }, restOverrideSec: 60, savedRestByExercise: saved }),
    { seconds: 90, source: 'exercise' },
  );
  const lines = describeRestRules([bench, row], 0, { restByExercise: { 'bench press': 90 }, savedRestByExercise: { 'ex-row': 75 } });
  assert.deepEqual(lines, [
    '- Rest before each remaining Bench Press set: 90s (they asked for it for this exercise, for the rest of this workout).',
    '- Other rest lengths in effect: Barbell Row 75s (saved).',
  ]);
});
