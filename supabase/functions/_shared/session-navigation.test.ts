import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSessionExercise } from './session-navigation.ts';

const ARMS = ['Dumbbell Curl', 'Cable Tricep Pushdown', 'Hammer Curl', 'Overhead Tricep Extension'];

test('an exact catalog name matches', () => {
  assert.deepEqual(matchSessionExercise(ARMS, 'Hammer Curl'), {
    kind: 'matched',
    name: 'Hammer Curl',
  });
});

test('Damion\'s own wording resolves — "pushdowns" is Cable Tricep Pushdown', () => {
  assert.deepEqual(matchSessionExercise(ARMS, 'pushdowns'), {
    kind: 'matched',
    name: 'Cable Tricep Pushdown',
  });
  assert.deepEqual(matchSessionExercise(ARMS, 'tricep pushdown'), {
    kind: 'matched',
    name: 'Cable Tricep Pushdown',
  });
});

test('a request that fits two exercises is ambiguous rather than a guess', () => {
  assert.deepEqual(matchSessionExercise(ARMS, 'curl'), {
    kind: 'ambiguous',
    candidates: ['Dumbbell Curl', 'Hammer Curl'],
  });
});

test('an exercise that is not in this session is never matched to something else', () => {
  assert.deepEqual(matchSessionExercise(ARMS, 'Back Squat'), { kind: 'not_found' });
  assert.deepEqual(matchSessionExercise(ARMS, 'kickbacks'), { kind: 'not_found' });
});

test('filler words in the request do not block a match', () => {
  assert.deepEqual(matchSessionExercise(ARMS, 'back to the pushdowns'), {
    kind: 'matched',
    name: 'Cable Tricep Pushdown',
  });
});

test('an empty or meaningless request matches nothing', () => {
  assert.deepEqual(matchSessionExercise(ARMS, '   '), { kind: 'not_found' });
  assert.deepEqual(matchSessionExercise(ARMS, 'the'), { kind: 'not_found' });
});
