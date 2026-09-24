import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebuildResumedSession } from '../session/resumeSession';

const plan = [
  { id: 'p1', exerciseId: 'bench', name: 'Bench Press', sets: 4, repScheme: '6-8', loadScheme: '%1RM' },
  { id: 'p2', exerciseId: 'incline', name: 'Incline Dumbbell Press', sets: 3, repScheme: '8-10', loadScheme: null },
  { id: 'p3', exerciseId: 'ohp', name: 'Overhead Press', sets: 3, repScheme: '8-10', loadScheme: null },
];

test('a saved session shape is rebuilt exactly, swap and split included', () => {
  const rebuilt = rebuildResumedSession(
    plan,
    [
      { name: 'Bench Press', planned_sets: 1, exercise_id: 'bench', rep_scheme: '6-8', load_scheme: '%1RM' },
      { name: 'Dumbbell Bench Press', planned_sets: 3, exercise_id: 'db', rep_scheme: '6-8', load_scheme: null },
      { name: 'Incline Dumbbell Press', planned_sets: 3, exercise_id: 'incline', rep_scheme: '8-10', load_scheme: null },
      { name: 'Overhead Press', planned_sets: 3, exercise_id: 'ohp', rep_scheme: '8-10', load_scheme: null },
    ],
    ['Bench Press', 'Dumbbell Bench Press'],
  );
  assert.deepEqual(
    rebuilt.map((e) => [e.name, e.sets, e.repScheme]),
    [
      ['Bench Press', 1, '6-8'],
      ['Dumbbell Bench Press', 3, '6-8'],
      ['Incline Dumbbell Press', 3, '8-10'],
      ['Overhead Press', 3, '8-10'],
    ],
  );
  assert.equal(rebuilt[0].loadScheme, 'working weight');
  assert.equal(rebuilt[1].exerciseId, 'db');
});

test("an older record without the shape still keeps a swapped exercise's sets (Hakeem's resume repro)", () => {
  const rebuilt = rebuildResumedSession(
    plan,
    [
      { name: 'Dumbbell Bench Press', planned_sets: 4 },
      { name: 'Incline Dumbbell Press', planned_sets: 3 },
      { name: 'Overhead Press', planned_sets: 3 },
    ],
    ['Dumbbell Bench Press'],
  );
  assert.deepEqual(rebuilt.map((e) => e.name), ['Dumbbell Bench Press', 'Incline Dumbbell Press', 'Overhead Press']);
  assert.equal(rebuilt[0].repScheme, '6-8');
  assert.equal(rebuilt[0].sets, 4);
});

test('with no saved shape at all, a swapped name replaces the exercise it contains', () => {
  const rebuilt = rebuildResumedSession(plan, null, ['Dumbbell Bench Press']);
  assert.deepEqual(rebuilt.map((e) => e.name), ['Dumbbell Bench Press', 'Incline Dumbbell Press', 'Overhead Press']);
});

test('a done exercise matching nothing in the plan is kept, never dropped', () => {
  const rebuilt = rebuildResumedSession(plan, null, ['Push-up']);
  assert.equal(rebuilt[0].name, 'Push-up');
  assert.equal(rebuilt.length, 4);
});

test('an untouched session resumes as the plan', () => {
  const rebuilt = rebuildResumedSession(plan, null, ['Bench Press']);
  assert.deepEqual(rebuilt.map((e) => e.id), ['p1', 'p2', 'p3']);
});
