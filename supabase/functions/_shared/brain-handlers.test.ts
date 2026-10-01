import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSameMeal, asksToRemoveASet, describeRemovedSet } from './brain-handlers.ts';

test('a correction with different quantities is recognized as the same meal', () => {
  assert.equal(looksLikeSameMeal('6 egg whites and turkey bacon', '4 egg whites and turkey bacon'), true);
});

test('adding an item to an already-logged meal is still recognized as the same meal', () => {
  assert.equal(looksLikeSameMeal('eggs and turkey bacon', 'eggs, turkey bacon, and strawberries'), true);
});

test('two unrelated meals are not treated as a correction', () => {
  assert.equal(looksLikeSameMeal('egg whites and turkey bacon', 'chicken breast and rice'), false);
});

test('a same-named meal eaten again hours apart still reads as similar text — window filtering, not this, keeps it separate', () => {
  // looksLikeSameMeal only judges text similarity; brain-handlers.ts is responsible for scoping
  // this check to a short lookback window so a legitimate second serving later in the day never
  // reaches it. Confirms the function itself has no time awareness to rely on.
  assert.equal(looksLikeSameMeal('eggs and toast', 'eggs and toast'), true);
});

test('empty or missing descriptions never match', () => {
  assert.equal(looksLikeSameMeal('', 'chicken and rice'), false);
  assert.equal(looksLikeSameMeal('chicken and rice', ''), false);
});

test('the coach can only remove a set when the user asked for it (Hakeem, 29 Sep: "176 for five reps" deleted set 1)', async () => {
  const { asksToRemoveASet } = await import('./brain-handlers.ts');
  for (const said of ['176 for five reps.', '17645.', 'Done, 176 for 5.', 'No.', 'Yes', 'Make it 90 seconds', '[[SYSTEM_CUE]] rest_over']) {
    assert.equal(asksToRemoveASet(said), false, said);
  }
  for (const said of ['undo that', 'remove the last set', 'You logged it twice', "I haven't done set 2 yet", 'take that one off', 'I only did 1 set']) {
    assert.equal(asksToRemoveASet(said), true, said);
  }
});

test('2 Oct: an undo names the exercise and set it actually removed', () => {
  const state = {
    exercises: [
      { name: 'Incline Dumbbell Press', sets: 3 },
      { name: 'Overhead Press', sets: 3 },
    ],
    loggedSets: [
      [{ weight: 36.3, reps: 11, at: 1_000 }],
      [{ weight: 45.4, reps: 11, at: 2_000 }],
    ],
  };
  assert.deepEqual(describeRemovedSet(state), {
    exerciseName: 'Overhead Press',
    setNumber: 1,
    totalSets: 3,
  });
});

test('2 Oct: with nothing logged there is no set number to hand the coach', () => {
  assert.equal(describeRemovedSet({ exercises: [{ name: 'Overhead Press', sets: 3 }], loggedSets: [[]] }), null);
});

test('2 Oct: a polite undo request still reaches the undo tool', () => {
  for (const line of [
    'Uh, the last set, can you undo that?',
    'Can you undo that?',
    'Could you delete that last set?',
    'Take the last set off.',
  ]) {
    assert.ok(asksToRemoveASet(line), line);
  }
  assert.equal(asksToRemoveASet('Done 10 reps.'), false);
  assert.equal(asksToRemoveASet('[[SYSTEM_CUE]] session_start'), false);
});
