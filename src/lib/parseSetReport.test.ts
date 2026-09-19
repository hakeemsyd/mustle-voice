import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSetReport, parseStatedWeight, describeParsedSet } from './parseSetReport';

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

test('the Set-done prefill parses back to exactly what it displays', () => {
  assert.deepEqual(parseSetReport('75 lb 6 reps', 'imperial'), { weight: 34, reps: 6 });
  assert.deepEqual(parseSetReport('60 kg 8 reps', 'metric'), { weight: 60, reps: 8 });
  assert.deepEqual(parseSetReport('12 reps', 'imperial'), { weight: null, reps: 12 });
});
