import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertLoadScheme as serverConvert,
  localizeWeights,
  normalizeExercisesDone,
  normalizeLoadToKg,
} from './load-scheme.ts';
import { convertLoadScheme as clientConvert } from '../../../src/lib/loadScheme.ts';

const bothCopies = [
  { label: 'server', convert: serverConvert },
  { label: 'client', convert: clientConvert },
] as const;

for (const { label, convert } of bothCopies) {
  test(`${label}: a kg scheme is read in pounds by an imperial user`, () => {
    assert.equal(convert('34 kg', 'imperial'), '75 lb');
    assert.equal(convert('60-70 kg', 'imperial'), '132.3-154.3 lb');
    assert.equal(convert('22.5 kg each', 'imperial'), '49.6 lb each');
  });

  test(`${label}: a lb scheme is read in kilograms by a metric user`, () => {
    assert.equal(convert('75 lb', 'metric'), '34 kg');
    assert.equal(convert('135 pounds', 'metric'), '61.2 kg');
  });

  test(`${label}: a scheme already in the reader's units is untouched`, () => {
    assert.equal(convert('34 kg', 'metric'), '34 kg');
    assert.equal(convert('75 lb', 'imperial'), '75 lb');
  });

  test(`${label}: schemes with no number survive intact`, () => {
    for (const scheme of ['bodyweight', 'empty bar to start', 'light — find your working weight']) {
      assert.equal(convert(scheme, 'imperial'), scheme);
      assert.equal(convert(scheme, 'metric'), scheme);
    }
  });

  test(`${label}: reps and other numbers are never mistaken for a load`, () => {
    assert.equal(convert('3 sets of 8-10', 'imperial'), '3 sets of 8-10');
    assert.equal(convert('RPE 8', 'imperial'), 'RPE 8');
  });

  test(`${label}: spelled-out and abbreviated units are both recognised`, () => {
    assert.equal(convert('34 kilograms', 'imperial'), '75 lb');
    assert.equal(convert('34kg', 'imperial'), '75 lb');
    assert.equal(convert('34 kilos', 'imperial'), '75 lb');
  });
}

test('a logged-set load list is localized, not left as bare kilogram numbers', () => {
  const result = localizeWeights({ exercises_done: [{ name: 'Bench Press', reps: '8,8,6', load: '34,34,36' }] }, 'imperial');
  assert.equal((result as any).exercises_done[0].load, '75, 75, 79.4 lb');
});

test('a metric reader gets the same list labelled in kilograms', () => {
  const result = localizeWeights({ exercises_done: [{ load: '34,34,36' }] }, 'metric');
  assert.equal((result as any).exercises_done[0].load, '34, 34, 36 kg');
});

test('bodyweight and non-numeric loads pass through', () => {
  assert.equal((localizeWeights({ load: 'bodyweight' }, 'imperial') as any).load, 'bodyweight');
  assert.equal((localizeWeights({ load: 'light — find it' }, 'imperial') as any).load, 'light — find it');
});

test('a stored bodyweight is renamed as well as converted for an imperial reader', () => {
  const result = localizeWeights({ weight_kg: 80 }, 'imperial') as any;
  assert.equal(result.weight_lb, 176.4);
  assert.equal(result.weight_kg, undefined);
});

test('nested load schemes are reached', () => {
  const result = localizeWeights(
    { next_session_to_train: { exercises: [{ load_scheme: '34 kg' }, { load_scheme: 'bodyweight' }] } },
    'imperial',
  ) as any;
  assert.equal(result.next_session_to_train.exercises[0].load_scheme, '75 lb');
  assert.equal(result.next_session_to_train.exercises[1].load_scheme, 'bodyweight');
});

test('values that are not weights survive untouched', () => {
  const result = localizeWeights({ status: 'shown', reps: '8,8,6', calories: 420, ok: true, none: null }, 'imperial') as any;
  assert.deepEqual(result, { status: 'shown', reps: '8,8,6', calories: 420, ok: true, none: null });
});

test('a pound load from the model is stored as kilogram numbers', () => {
  assert.equal(normalizeLoadToKg('95 lb'), '43.1');
  assert.equal(normalizeLoadToKg('95,95,95 lb'), '43.1,43.1,43.1');
  assert.equal(normalizeLoadToKg('135 pounds'), '61.2');
});

test('a kilogram or bare-number load is stored as given', () => {
  assert.equal(normalizeLoadToKg('60,60,62.5'), '60,60,62.5');
  assert.equal(normalizeLoadToKg('60 kg'), '60');
  assert.equal(normalizeLoadToKg(60), '60');
});

test('bodyweight in any spelling stays bodyweight', () => {
  for (const v of ['bodyweight', 'body weight', 'BW', '', 'n/a', null, undefined]) {
    assert.equal(normalizeLoadToKg(v), 'bodyweight');
  }
});

test('exercises_done entries are normalized in place', () => {
  const out = normalizeExercisesDone([
    { name: 'Bench Press', sets: 3, reps: '6', load: '95 lb' },
    { name: 'Push-up', sets: 3, reps: '12', load: 'bodyweight' },
  ]) as any[];
  assert.equal(out[0].load, '43.1');
  assert.equal(out[0].name, 'Bench Press');
  assert.equal(out[1].load, 'bodyweight');
});
