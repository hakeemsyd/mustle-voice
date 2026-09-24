import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLoadScheme } from '../../supabase/functions/_shared/load-intent';
import { convertLoadScheme } from './loadScheme';

test('a bare %1RM placeholder becomes something a lifter can act on', () => {
  assert.equal(normalizeLoadScheme('%1RM'), 'working weight');
  assert.equal(normalizeLoadScheme('% 1RM'), 'working weight');
  assert.equal(normalizeLoadScheme('1RM'), 'working weight');
  assert.equal(normalizeLoadScheme('one rep max'), 'working weight');
});

test('a percentage of 1RM keeps its intensity without the unusable percentage', () => {
  assert.equal(normalizeLoadScheme('75% 1RM'), 'moderate');
  assert.equal(normalizeLoadScheme('%75-80 1RM'), 'moderate');
  assert.equal(normalizeLoadScheme('85% 1RM'), 'heavy');
  assert.equal(normalizeLoadScheme('87% 1RM'), 'heavy');
  assert.equal(normalizeLoadScheme('60% 1RM'), 'light');
  assert.equal(normalizeLoadScheme('%70 1RM'), 'moderate');
});

test('every other load scheme passes through untouched', () => {
  for (const scheme of ['light — find your working weight', 'bodyweight', 'RPE 8', '75 lb each', 'moderate', '40 lb']) {
    assert.equal(normalizeLoadScheme(scheme), scheme);
  }
  assert.equal(normalizeLoadScheme(null), null);
});

test('the display conversion never shows a 1RM placeholder', () => {
  assert.equal(convertLoadScheme('%1RM', 'imperial'), 'working weight');
  assert.equal(convertLoadScheme('80% 1RM', 'metric'), 'moderate');
  assert.equal(convertLoadScheme('60 kg', 'imperial'), '132.3 lb');
});
