import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImplausibleWeightJump, parseLoadSchemeKg } from './weightPlausibility';

test("Damion's case: 75 lb prescribed, 5 lb heard, is not accepted silently", () => {
  const prescribed = parseLoadSchemeKg('75 lb');
  assert.ok(prescribed !== null);
  const misheard = 5 * 0.453592;
  assert.equal(isImplausibleWeightJump(misheard, prescribed), true);
});

test('an ordinary working-weight change is left alone', () => {
  assert.equal(isImplausibleWeightJump(80, 75), false);
  assert.equal(isImplausibleWeightJump(60, 75), false);
  assert.equal(isImplausibleWeightJump(75, 75), false);
  assert.equal(isImplausibleWeightJump(100, 60), false);
});

test('a drop or jump past the ratio bounds is flagged', () => {
  assert.equal(isImplausibleWeightJump(20, 75), true);
  assert.equal(isImplausibleWeightJump(200, 75), true);
});

test('nothing to compare against means nothing to flag', () => {
  assert.equal(isImplausibleWeightJump(5, null), false);
  assert.equal(isImplausibleWeightJump(null, 75), false);
  assert.equal(isImplausibleWeightJump(0, 75), false);
  assert.equal(isImplausibleWeightJump(75, 0), false);
});

test('load schemes parse to kilograms whichever unit they were written in', () => {
  assert.equal(parseLoadSchemeKg('34 kg'), 34);
  assert.equal(parseLoadSchemeKg('75 lb'), 34);
  assert.equal(parseLoadSchemeKg('bodyweight'), null);
  assert.equal(parseLoadSchemeKg(null), null);
});

test('a scheme with no real weight in it yields no reference, so nothing is ever flagged', () => {
  for (const scheme of ['%1RM', '75%1RM', '60', 'RPE 8', 'AMRAP']) {
    assert.equal(parseLoadSchemeKg(scheme), null, scheme);
    assert.equal(isImplausibleWeightJump(60, parseLoadSchemeKg(scheme)), false, scheme);
  }
});
