// Adversarial tests for the safety gate. Run: node --test supabase/functions/_shared/
// The point: prove a plan that violates an active injury CANNOT pass validation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan, isPlanSafe, normalizeArea } from './injury-validator.ts';
import { findExercise, EXERCISE_CATALOG } from './exercise-catalog.ts';

const ex = (name: string) => {
  const e = findExercise(name);
  if (!e) throw new Error(`catalog missing: ${name}`);
  return { name: e.name, contraindicatedFor: e.contraindicatedFor };
};

const activeKnee = [{ area: 'left_knee', status: 'active' as const }];

test('flagged knee REJECTS a heavy back squat', () => {
  const v = validatePlan([ex('Back Squat')], activeKnee);
  assert.ok(v.length > 0, 'expected a violation');
  assert.equal(v[0].exercise, 'Back Squat');
  assert.equal(v[0].injuryArea, 'knee');
});

test('knee-safe plan PASSES (hip thrust + leg curl + upper)', () => {
  const plan = [ex('Hip Thrust'), ex('Leg Curl'), ex('Lat Pulldown'), ex('Bench Press')];
  assert.ok(isPlanSafe(plan, activeKnee));
});

test('resolved injury imposes NO restriction', () => {
  const resolved = [{ area: 'left_knee', status: 'resolved' as const }];
  assert.ok(isPlanSafe([ex('Back Squat')], resolved));
});

test('no injuries -> anything passes', () => {
  assert.ok(isPlanSafe([ex('Back Squat'), ex('Deadlift')], []));
});

test('lumbar injury REJECTS deadlift', () => {
  const lumbar = [{ area: 'lower back', status: 'active' as const }];
  assert.ok(!isPlanSafe([ex('Deadlift')], lumbar), 'deadlift should be blocked');
});

test('shoulder injury REJECTS overhead press but allows pulls', () => {
  const shoulder = [{ area: 'right shoulder', status: 'active' as const }];
  assert.ok(!isPlanSafe([ex('Overhead Press')], shoulder));
  assert.ok(isPlanSafe([ex('Lat Pulldown'), ex('Seated Row'), ex('Face Pull')], shoulder));
});

test('area normalization: side + plural still restricts ("knees")', () => {
  assert.equal(normalizeArea('knees'), 'knee');
  assert.equal(normalizeArea('Right Knee'), 'knee');
  assert.equal(normalizeArea('lower_back'), 'lumbar');
  assert.ok(validatePlan([ex('Back Squat')], [{ area: 'knees', status: 'active' }]).length > 0);
});

test('THE INVARIANT: no catalog exercise contraindicated for the knee ever passes a knee flag', () => {
  const risky = EXERCISE_CATALOG.filter(e =>
    e.contraindicatedFor.some(t => ['deep_knee_flexion_loaded', 'high_impact', 'heavy_axial_load'].includes(t)),
  );
  assert.ok(risky.length > 0, 'sanity: catalog has knee-risky moves');
  for (const e of risky) {
    assert.ok(
      !isPlanSafe([{ name: e.name, contraindicatedFor: e.contraindicatedFor }], activeKnee),
      `${e.name} must NOT pass with an active knee injury`,
    );
  }
});
