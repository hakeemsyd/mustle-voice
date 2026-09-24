import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EXERCISE_CATALOG,
  findExercise,
  isCardioExercise,
  isTimedExercise,
  loadSchemeForExercise,
} from './exercise-catalog.ts';
import { INJURY_FORBIDS } from './injury-validator.ts';

test('a bodyweight exercise always gets "bodyweight", whatever was requested', () => {
  assert.equal(loadSchemeForExercise('Push-up', '%1RM', false), 'bodyweight');
  assert.equal(loadSchemeForExercise('Push-up', '70 kg', true), 'bodyweight');
});

test('an unfilled %1RM with no load history on file never reaches the screen', () => {
  assert.equal(loadSchemeForExercise('Overhead Press', '%1RM', false), null);
  assert.equal(loadSchemeForExercise('Overhead Press', '70-80% 1RM', false), null);
});

test('even with load history a 1RM scheme is stored as something actionable, never a percentage', () => {
  assert.equal(loadSchemeForExercise('Overhead Press', '70-80% 1RM', true), 'moderate');
  assert.equal(loadSchemeForExercise('Bench Press', '%1RM', true), 'working weight');
});

test('an ordinary concrete load scheme is untouched either way', () => {
  assert.equal(loadSchemeForExercise('Overhead Press', '40 kg', false), '40 kg');
  assert.equal(loadSchemeForExercise('Overhead Press', 'RPE 8', false), 'RPE 8');
});

test('no requested scheme at all stays null', () => {
  assert.equal(loadSchemeForExercise('Overhead Press', null, false), null);
  assert.equal(loadSchemeForExercise('Overhead Press', undefined, true), null);
});

test('the movements Damion was told were unavailable are in the catalog', () => {
  for (const name of ['Incline Dumbbell Curl', 'Tricep Kickback', 'Cable Glute Kickback']) {
    assert.ok(findExercise(name), `${name} missing from the catalog`);
  }
});

test('a bare "kickbacks" matches neither kickback variant, so the coach has to ask which', () => {
  assert.equal(findExercise('Kickback'), undefined);
  assert.equal(findExercise('Kickbacks'), undefined);
});

test('cardio carries no load scheme at all, not even bodyweight', () => {
  assert.equal(loadSchemeForExercise('Zone 2 Cardio', '25 minutes', false), null);
  assert.equal(loadSchemeForExercise('Running', 'light', true), null);
});

test('timed work is flagged separately from bodyweight work', () => {
  assert.ok(isTimedExercise('Zone 2 Cardio'));
  assert.ok(isTimedExercise('Plank'));
  assert.ok(!isTimedExercise('Dumbbell Curl'));
  assert.ok(isCardioExercise('Rowing Machine'));
  assert.ok(!isCardioExercise('Plank'));
});

test('every catalog name is unique', () => {
  const names = EXERCISE_CATALOG.map((e) => e.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test('every contraindication tag is one the injury validator actually enforces', () => {
  const enforced = new Set(Object.values(INJURY_FORBIDS).flat());
  for (const exercise of EXERCISE_CATALOG) {
    for (const tag of exercise.contraindicatedFor) {
      assert.ok(enforced.has(tag), `${exercise.name} carries unenforced tag "${tag}"`);
    }
  }
});

test('the catalog, its seed migrations and the client name list stay in sync', () => {
  const root = new URL('../../../', import.meta.url).pathname;
  const migrations = [
    '20260729060000_seed_exercise_catalog.sql',
    '20260914120000_custom_session.sql',
    '20260924090000_expand_exercise_catalog.sql',
  ];
  const seeded = migrations.flatMap((file) =>
    [...readFileSync(`${root}supabase/migrations/${file}`, 'utf8').matchAll(/^ {2}\('((?:[^']|'')+)'/gm)].map(
      (m) => m[1].replace(/''/g, "'"),
    ),
  );
  const client = [
    ...readFileSync(`${root}src/lib/exerciseCatalog.ts`, 'utf8').matchAll(/^ {2}(?:'([^']+)'|"([^"]+)"),$/gm),
  ].map((m) => m[1] ?? m[2]);

  const catalog = EXERCISE_CATALOG.map((e) => e.name);
  assert.deepEqual(catalog.filter((n) => !seeded.includes(n)), [], 'in the catalog but never seeded');
  assert.deepEqual(seeded.filter((n) => !catalog.includes(n)), [], 'seeded but not in the catalog');
  assert.deepEqual(catalog.filter((n) => !client.includes(n)), [], 'in the catalog but missing client-side');
});
