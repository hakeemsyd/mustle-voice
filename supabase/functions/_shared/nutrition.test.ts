// Run: node --test supabase/functions/_shared/nutrition.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNutritionTargets } from './nutrition.ts';

test('cut has fewer calories than maintain, which has fewer than bulk', () => {
  const cut = computeNutritionTargets(80, 'cut');
  const maintain = computeNutritionTargets(80, 'maintain');
  const bulk = computeNutritionTargets(80, 'bulk');

  assert.ok(cut.calories < maintain.calories);
  assert.ok(maintain.calories < bulk.calories);
});

test('cut has the highest protein per kg (muscle-sparing in a deficit)', () => {
  const cut = computeNutritionTargets(80, 'cut');
  const bulk = computeNutritionTargets(80, 'bulk');

  assert.ok(cut.protein_g / 80 >= bulk.protein_g / 80);
});

test('macros roughly reconstitute total calories', () => {
  const t = computeNutritionTargets(75, 'recomp');
  const fromMacros = t.protein_g * 4 + t.carbs_g * 4 + t.fat_g * 9;
  assert.ok(Math.abs(fromMacros - t.calories) <= 8);
});
