import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  describeImportedWorkout,
  findInventedRepTargets,
  repSchemeEchoesSetCount,
  statesRepTarget,
} from './rep-target.ts';

const DAMION_ARMS = 'Arms day: Incline curls 40s x4, Pushdowns 50 lb x4, Hammer curls 40s x3, Kickbacks 40s x3';

test('an "xN" workout with no rep target anywhere is recognised as stating no reps', () => {
  assert.equal(statesRepTarget(DAMION_ARMS), false);
  assert.equal(statesRepTarget('Hammer curls 40s x3'), false);
  assert.equal(statesRepTarget(''), false);
  assert.equal(statesRepTarget(null), false);
});

test('every ordinary way of writing a rep target counts as stating one', () => {
  for (const text of [
    'Bench 4 sets of 8',
    'Curls 3x10',
    'Squat 5 x 5',
    'Rows 8-10 reps',
    'Press 8 to 12',
    'Pull-ups AMRAP',
    'Dips 12 reps',
  ]) {
    assert.equal(statesRepTarget(text), true, text);
  }
});

test('a rep scheme that is just the set count repeated is flagged', () => {
  assert.equal(repSchemeEchoesSetCount('3', 3), true);
  assert.equal(repSchemeEchoesSetCount('4', 4), true);
  assert.equal(repSchemeEchoesSetCount(' 4 ', 4), true);
});

test('a real rep scheme is never flagged', () => {
  assert.equal(repSchemeEchoesSetCount('8-10', 4), false);
  assert.equal(repSchemeEchoesSetCount('AMRAP', 3), false);
  assert.equal(repSchemeEchoesSetCount('25 minutes', 1), false);
  assert.equal(repSchemeEchoesSetCount('8', 4), false);
  assert.equal(repSchemeEchoesSetCount(null, 3), false);
});

test("Damion's exact case is caught: x4/x3 copied into the rep target", () => {
  const invented = findInventedRepTargets(
    [
      { name: 'Incline Dumbbell Curl', sets: 4, rep_scheme: '4' },
      { name: 'Cable Tricep Pushdown', sets: 4, rep_scheme: '4' },
      { name: 'Hammer Curl', sets: 3, rep_scheme: '3' },
      { name: 'Tricep Kickback', sets: 3, rep_scheme: '3' },
      { name: 'Zone 2 Cardio', sets: 1, rep_scheme: '25 minutes' },
    ],
    DAMION_ARMS,
  );
  assert.deepEqual(invented, [
    'Incline Dumbbell Curl',
    'Cable Tricep Pushdown',
    'Hammer Curl',
    'Tricep Kickback',
  ]);
});

test('a legitimate 5x5 the user actually asked for is never blocked', () => {
  assert.deepEqual(
    findInventedRepTargets([{ name: 'Back Squat', sets: 5, rep_scheme: '5' }], 'Squat 5x5 please'),
    [],
  );
  assert.deepEqual(
    findInventedRepTargets([{ name: 'Back Squat', sets: 3, rep_scheme: '3' }], '3 sets of 3 on squat'),
    [],
  );
});

test('a sensible coach-chosen rep range is never blocked, even with no reps stated', () => {
  assert.deepEqual(
    findInventedRepTargets([{ name: 'Hammer Curl', sets: 3, rep_scheme: '8-10' }], DAMION_ARMS),
    [],
  );
});

test('a written workout in xN notation with no rep target triggers the per-turn directive', () => {
  const line = describeImportedWorkout(DAMION_ARMS);
  assert.ok(line && /create_custom_session/.test(line));
  assert.ok(line && /do not state one/.test(line));
});

test('a workout that states its reps gets no directive', () => {
  assert.equal(describeImportedWorkout('Back day: rows 3x10, pulldowns 3x12, face pulls 3x15'), null);
  assert.equal(describeImportedWorkout('Squat 5 sets of 5'), null);
});

test('ordinary conversation never triggers it', () => {
  assert.equal(describeImportedWorkout('how did I do last week?'), null);
  assert.equal(describeImportedWorkout(''), null);
  assert.equal(describeImportedWorkout(null), null);
  assert.equal(describeImportedWorkout('add hammer curls x3'), null);
});
