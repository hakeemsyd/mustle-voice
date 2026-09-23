import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISE_REFERENCE, getExerciseReference } from './exerciseGuides';
import { EXERCISE_NAMES } from './exerciseCatalog';

test('every catalog exercise has reference content in the Guide sheet', () => {
  const missing = EXERCISE_NAMES.filter((name) => !getExerciseReference(name));
  assert.deepEqual(missing, []);
});

test('no guide entry exists for an exercise that is not in the catalog', () => {
  const orphans = Object.keys(EXERCISE_REFERENCE).filter((name) => !EXERCISE_NAMES.includes(name));
  assert.deepEqual(orphans, []);
});

test('every entry carries a summary, muscles, setup and execution', () => {
  for (const [name, ref] of Object.entries(EXERCISE_REFERENCE)) {
    assert.ok(ref.summary.length > 40, `${name} has no real summary`);
    assert.ok(ref.muscles.length > 0, `${name} lists no muscles`);
    assert.ok(ref.setup.length >= 2, `${name} has too few setup steps`);
    assert.ok(ref.execution.length >= 3, `${name} has too few execution steps`);
  }
});

test('the lookup is case-insensitive, since names arrive from several sources', () => {
  assert.ok(getExerciseReference('cable tricep pushdown'));
  assert.ok(getExerciseReference('TRICEP KICKBACK'));
  assert.equal(getExerciseReference('Not An Exercise'), null);
});

test('a guide file with no duplicate keys — TypeScript allows the later one to silently win', () => {
  const source = readFileSync('src/lib/exerciseGuides.ts', 'utf8');
  const keys = [...source.matchAll(/^ {2}(?:'([^']+)'|"([^"]+)"|([A-Za-z][A-Za-z0-9-]*)):\s*\{/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  );
  assert.deepEqual(keys.filter((k, i) => keys.indexOf(k) !== i), []);
});
