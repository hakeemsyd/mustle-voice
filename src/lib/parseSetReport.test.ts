import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSetReport,
  parseStatedWeight,
  describeParsedSet,
  looksLikeSetReport,
} from './parseSetReport';

test('pounds are converted to kilograms, not stored as the raw number', () => {
  assert.deepEqual(parseSetReport('75 lb 5 reps'), { weight: 34, reps: 5 });
  assert.deepEqual(parseSetReport('75 pounds for 5 reps'), { weight: 34, reps: 5 });
});

test('kilograms are stored as stated', () => {
  assert.deepEqual(parseSetReport('60 kg 8 reps'), { weight: 60, reps: 8 });
});

test('a bare number follows the user preference', () => {
  assert.deepEqual(parseSetReport('75 5', 'imperial'), { weight: 34, reps: 5 });
  assert.deepEqual(parseSetReport('75 5', 'metric'), { weight: 75, reps: 5 });
});

test('an explicit unit always wins over the preference', () => {
  assert.deepEqual(parseSetReport('60 kg 8 reps', 'imperial'), { weight: 60, reps: 8 });
  assert.deepEqual(parseSetReport('75 lb 5 reps', 'metric'), { weight: 34, reps: 5 });
});

test('a stated weight converts the same way', () => {
  assert.equal(parseStatedWeight('75 lb'), 34);
  assert.equal(parseStatedWeight("I'm using 60 kg"), 60);
  assert.equal(parseStatedWeight('75', 'imperial'), null);
});

test('a set is displayed back in the units the user reads in', () => {
  assert.equal(describeParsedSet({ weight: 34, reps: 5 }, 'imperial'), '75 lb × 5 reps');
  assert.equal(describeParsedSet({ weight: 60, reps: 8 }, 'metric'), '60 kg × 8 reps');
});

test('bodyweight and timed holds are unaffected by units', () => {
  assert.equal(describeParsedSet({ weight: null, reps: 12 }, 'imperial'), '12 reps · bodyweight');
  assert.equal(describeParsedSet({ weight: null, reps: 52, unit: 'seconds' }, 'imperial'), '52s held');
});

test('conversation is still never mistaken for a set', () => {
  assert.equal(parseSetReport("I've got about 1 more set, give me 2 minutes"), null);
  assert.equal(parseSetReport('60'), null);
});

test('counting reps out loud never logs a set', () => {
  const spoken = { allowPositional: false };
  assert.equal(parseSetReport('Four, five.', 'imperial', spoken), null);
  assert.equal(parseSetReport('One, two, three.', 'imperial', spoken), null);
  assert.equal(parseSetReport('75 5', 'imperial', spoken), null);
  assert.equal(looksLikeSetReport('Four, five.', 'imperial', spoken), false);
  assert.equal(looksLikeSetReport('Six.', 'imperial', spoken), false);
});

test('an explicit spoken set report still logs', () => {
  const spoken = { allowPositional: false };
  assert.deepEqual(parseSetReport('75 pounds, 8 reps', 'imperial', spoken), { weight: 34, reps: 8 });
  assert.deepEqual(parseSetReport('8 reps', 'imperial', spoken), { weight: null, reps: 8 });
  assert.deepEqual(
    parseSetReport('held it for 52 seconds', 'imperial', { ...spoken, timedExercise: true }),
    { weight: null, reps: 52, unit: 'seconds' },
  );
  assert.equal(looksLikeSetReport('Set one done.', 'imperial', spoken), true);
});

test('the typed shorthand is unaffected', () => {
  assert.deepEqual(parseSetReport('75 5', 'imperial'), { weight: 34, reps: 5 });
});

test('the Set-done prefill parses back to exactly what it displays', () => {
  assert.deepEqual(parseSetReport('75 lb 6 reps', 'imperial'), { weight: 34, reps: 6 });
  assert.deepEqual(parseSetReport('60 kg 8 reps', 'metric'), { weight: 60, reps: 8 });
  assert.deepEqual(parseSetReport('12 reps', 'imperial'), { weight: null, reps: 12 });
});

test('minutes only read as a duration while the current exercise is actually timed', () => {
  assert.deepEqual(parseSetReport('did 25 minutes', 'metric', { timedExercise: true }), {
    weight: null,
    reps: 1500,
    unit: 'seconds',
  });
  assert.equal(parseSetReport('give me 2 minutes', 'metric'), null);
  assert.equal(parseSetReport('give me 2 minutes', 'metric', { timedExercise: false }), null);
});

test('a logged duration reads back as minutes once it is a whole number of them', () => {
  assert.equal(describeParsedSet({ weight: null, reps: 1500, unit: 'seconds' }), '25 min');
  assert.equal(describeParsedSet({ weight: null, reps: 52, unit: 'seconds' }), '52s held');
  assert.equal(describeParsedSet({ weight: null, reps: 90, unit: 'seconds' }), '90s held');
});

test('seconds still win over minutes when both could match', () => {
  assert.deepEqual(parseSetReport('held it 45 seconds', 'metric', { timedExercise: true }), {
    weight: null,
    reps: 45,
    unit: 'seconds',
  });
});
