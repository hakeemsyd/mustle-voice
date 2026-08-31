import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeSameMeal } from './brain-handlers.ts';

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
