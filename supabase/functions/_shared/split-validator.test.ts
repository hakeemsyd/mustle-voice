import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSplit } from './split-validator.ts';

const adjacent = (sessions: Parameters<typeof validateSplit>[0]) =>
  validateSplit(sessions).filter((p) => p.kind === 'adjacent_duplicate');

test('a pinned Mon/Wed/Fri split is not flagged for repeating a focus on non-adjacent days', () => {
  assert.deepEqual(
    adjacent([
      { day_order: 1, focus: 'lower', weekday: 1 },
      { day_order: 2, focus: 'upper', weekday: 3 },
      { day_order: 3, focus: 'upper', weekday: 5 },
    ]),
    [],
  );
});

test('a pinned split still catches a genuinely back-to-back repeat', () => {
  assert.equal(
    adjacent([
      { day_order: 1, focus: 'lower', weekday: 1 },
      { day_order: 2, focus: 'upper', weekday: 3 },
      { day_order: 3, focus: 'upper', weekday: 4 },
    ]).length,
    1,
  );
});

test('a pinned split catches a Saturday-to-Sunday wrap', () => {
  assert.equal(
    adjacent([
      { day_order: 1, focus: 'upper', weekday: 6 },
      { day_order: 2, focus: 'lower', weekday: 3 },
      { day_order: 3, focus: 'upper', weekday: 0 },
    ]).length,
    1,
  );
});

test('a flexible rotation with no weekdays still uses day_order adjacency', () => {
  assert.equal(
    adjacent([
      { day_order: 1, focus: 'upper' },
      { day_order: 2, focus: 'upper' },
      { day_order: 3, focus: 'lower' },
    ]).length,
    1,
  );
});

test('a full-body program repeating the same focus is left alone', () => {
  assert.deepEqual(
    adjacent([
      { day_order: 1, focus: 'full body', weekday: 1 },
      { day_order: 2, focus: 'full body', weekday: 3 },
      { day_order: 3, focus: 'full body', weekday: 5 },
    ]),
    [],
  );
});
