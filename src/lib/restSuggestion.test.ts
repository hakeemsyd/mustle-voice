import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRestSeconds, suggestRestSeconds } from './restSuggestion.ts';

test('the rest after a set starts from the same baseline the plan card shows', () => {
  assert.equal(estimateRestSeconds('3-5'), 150);
  assert.equal(suggestRestSeconds(5, '3-5', 1, 4).seconds, 150, 'heavy Deadlift triple-to-five: 150 s, as the card says');
  assert.equal(suggestRestSeconds(10, '8-10', 1, 3).seconds, 90);
  assert.equal(suggestRestSeconds(15, '12-15', 1, 3).seconds, 60);
});

test('it still adapts to how the set went, within 45 to 180 seconds', () => {
  assert.equal(suggestRestSeconds(4, '3-5', 1, 4).seconds, 170, 'one short of target: a little longer');
  assert.equal(suggestRestSeconds(2, '3-5', 1, 4).seconds, 180, 'well short: longer, capped at 180');
  assert.equal(suggestRestSeconds(14, '8-10', 1, 3).seconds, 70, 'well over target: shorter');
  assert.equal(suggestRestSeconds(10, '8-10', 3, 4).seconds, 105, 'late sets carry fatigue');
  assert.equal(suggestRestSeconds(25, '12-15', 1, 3).seconds, 45, 'never below 45');
});
