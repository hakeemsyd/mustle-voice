import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeTodaysFoodLog } from './food-log-context.ts';

test('no entries logged today produces no line at all', () => {
  assert.equal(describeTodaysFoodLog([]), null);
});

test('a single entry is named with its own macros and the matching total', () => {
  const line = describeTodaysFoodLog([
    { description: '1 banana', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3 },
  ]);
  assert.match(line!, /1 banana/);
  assert.match(line!, /27g carbs/);
  assert.match(line!, /27g carbs, 0g fat total/);
});

test("Damion's exact scenario — three entries sum to the total the card showed", () => {
  const line = describeTodaysFoodLog([
    { description: '1 banana', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3 },
    {
      description: '2 slices multigrain bread, 6 egg whites, 1 serving pistachios',
      calories: 505,
      protein_g: 32,
      carbs_g: 54,
      fat_g: 16,
    },
    { description: '1 slice multigrain bread', calories: 120, protein_g: 4, carbs_g: 24, fat_g: 1.5 },
  ]);
  assert.match(line!, /730 cal, 37g protein, 105g carbs, 18g fat total/);
  assert.match(line!, /1 banana/);
  assert.match(line!, /pistachios/);
});

test('never says it lacks a breakdown, and tells the model not to re-fetch just to answer', () => {
  const line = describeTodaysFoodLog([
    { description: '1 banana', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3 },
  ]);
  assert.match(line!, /never say you don't have a breakdown/i);
  assert.match(line!, /never call read_state or show_nutrition_summary/i);
});

test('a null macro on a row counts as zero rather than breaking the total', () => {
  const line = describeTodaysFoodLog([
    { description: 'water', calories: 0, protein_g: null, carbs_g: null, fat_g: null },
  ]);
  assert.match(line!, /0 cal, 0g protein, 0g carbs, 0g fat total/);
});
