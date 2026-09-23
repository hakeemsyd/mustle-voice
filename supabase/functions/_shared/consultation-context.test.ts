import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeConsultationStatus, missingConsultationTopics } from './consultation-context.ts';

test('an active plan produces no line at all, regardless of topics', () => {
  assert.equal(describeConsultationStatus(true, []), null);
  assert.equal(describeConsultationStatus(true, ['equipment', 'diet', 'schedule', 'goals_injuries']), null);
});

test('no plan and zero topics covered names all four', () => {
  const line = describeConsultationStatus(false, []);
  assert.match(line!, /equipment/i);
  assert.match(line!, /diet/i);
  assert.match(line!, /schedule|time/i);
  assert.match(line!, /goal.*injury|injury.*goal|goal or injury/i);
});

test('partial coverage only names what is still missing, not what is already covered', () => {
  const line = describeConsultationStatus(false, ['equipment', 'schedule']);
  assert.doesNotMatch(line!, /equipment/i);
  assert.doesNotMatch(line!, /schedule/i);
  assert.match(line!, /diet/i);
  assert.match(line!, /goal or injury/i);
});

test('always points at reusing onboarding answers and calling note_consultation_covered', () => {
  const line = describeConsultationStatus(false, []);
  assert.match(line!, /onboarding/i);
  assert.match(line!, /repeat/i);
  assert.match(line!, /note_consultation_covered/);
});

test('all four topics covered but still no active plan gives a distinct, non-null line', () => {
  const line = describeConsultationStatus(false, ['equipment', 'diet', 'schedule', 'goals_injuries']);
  assert.ok(line);
  assert.match(line!, /generate_training_plan/);
});

test('missingConsultationTopics ignores unrecognized values and dedupes', () => {
  assert.deepEqual(missingConsultationTopics(['equipment', 'equipment', 'not_a_real_topic']), [
    'diet',
    'schedule',
    'goals_injuries',
  ]);
});
