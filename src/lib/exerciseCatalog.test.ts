import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXERCISE_NAMES,
  BODYWEIGHT_EXERCISE_NAMES,
  isBodyweightWork,
  canonicalizeExerciseNames,
} from './exerciseCatalog';
import {
  EXERCISE_CATALOG,
  BODYWEIGHT_EXERCISES,
} from '../../supabase/functions/_shared/exercise-catalog';

test('the client name list matches the brain catalog exactly', () => {
  assert.deepEqual(EXERCISE_NAMES, EXERCISE_CATALOG.map((e) => e.name));
});

test('the client bodyweight set matches the brain one exactly', () => {
  assert.deepEqual([...BODYWEIGHT_EXERCISE_NAMES].sort(), [...BODYWEIGHT_EXERCISES].sort());
});

test('a catalog bodyweight movement is bodyweight whatever the plan wrote as its load', () => {
  assert.equal(isBodyweightWork('Push-up', 'light — find your working weight'), true);
  assert.equal(isBodyweightWork('Push-up', null), true);
  assert.equal(isBodyweightWork('Plank', '3 x 45s'), true);
});

test('a loaded movement is only bodyweight when the plan says so', () => {
  assert.equal(isBodyweightWork('Bench Press', '60-70 kg'), false);
  assert.equal(isBodyweightWork('Bench Press', null), false);
  assert.equal(isBodyweightWork('Bench Press', 'bodyweight'), true);
});

test('model paraphrases are rewritten to the catalog spelling, plural kept', () => {
  assert.equal(
    canonicalizeExerciseNames('Upper Push today — push-ups, lateral raises and overhead press.'),
    'Upper Push today — Push-ups, Lateral Raises and Overhead Press.',
  );
  assert.equal(canonicalizeExerciseNames('4 sets of pushups'), '4 sets of Push-ups');
  assert.equal(canonicalizeExerciseNames('Push Ups and Pull Ups'), 'Push-ups and Pull-ups');
  assert.equal(canonicalizeExerciseNames('bench presses'), 'Bench Presses');
});

test('text already in the catalog spelling is left untouched', () => {
  const line = 'Upper Push today — Push-up, Incline Dumbbell Press, and Lateral Raise.';
  assert.equal(canonicalizeExerciseNames(line), line);
  assert.equal(canonicalizeExerciseNames(canonicalizeExerciseNames(line)), line);
});

test('a longer name is not corrupted by the shorter one inside it', () => {
  assert.equal(canonicalizeExerciseNames('romanian deadlifts'), 'Romanian Deadlifts');
  assert.equal(canonicalizeExerciseNames('hanging knee raises'), 'Hanging Knee Raises');
});

test('a word that merely starts with an exercise name is left alone', () => {
  assert.equal(canonicalizeExerciseNames('deadlifting heavy'), 'deadlifting heavy');
  assert.equal(canonicalizeExerciseNames('planking'), 'planking');
});
