import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toResumableWorkout } from './resumePayload.ts';

const NOW = Date.parse('2026-10-01T22:10:00Z');

const ROW = {
  id: 'bd84e3eb-0000-0000-0000-000000000000',
  at: '2026-10-01T21:53:58.158652+00:00',
  status: 'partial',
  ended_at: null,
  last_activity_at: '2026-10-01T22:07:46.000+00:00',
  duration_sec: 820,
  plan_session_id: 'lower',
  plan_session: { focus: 'lower' },
  exercises_done: [
    { name: 'Back Squat', load: '45.4,45.4,45.4,40.8', reps: '8,8,8,8', sets: 4, tracked: 'live' },
    { name: 'Romanian Deadlift', load: '45.4', reps: '8', sets: 1, tracked: 'live' },
  ],
  vs_planned: {
    rest_override_sec: 20,
    exercises: [
      { name: 'Back Squat', rep_scheme: '6-8', load_scheme: 'working weight', planned_sets: 4, completed_sets: 4 },
      { name: 'Romanian Deadlift', rep_scheme: '8-10', load_scheme: 'working weight', planned_sets: 3, completed_sets: 1 },
      { name: 'Leg Press', rep_scheme: '10-12', load_scheme: 'working weight', planned_sets: 3, completed_sets: 0 },
      { name: 'Leg Curl', rep_scheme: '10-12', load_scheme: 'RPE 7', planned_sets: 3, completed_sets: 0 },
    ],
  },
};

test('2 Oct: a half-finished second exercise survives a resume', () => {
  const resumable = toResumableWorkout(ROW, NOW);
  assert.ok(resumable, 'an open partial workout was not offered back at all');
  const done = resumable.resume.exercisesDone;
  assert.equal(done.length, 2, 'the exercise that was mid-way through was dropped from the resume payload');
  assert.deepEqual(
    done.map((e: any) => [e.name, e.load, e.reps]),
    [
      ['Back Squat', '45.4,45.4,45.4,40.8', '8,8,8,8'],
      ['Romanian Deadlift', '45.4', '8'],
    ],
    'the resume payload no longer matches what was saved',
  );
  assert.equal(resumable.resume.sessionPlan?.length, 4, 'the later exercises were lost');
  assert.equal(resumable.resume.restOverrideSec, 20, 'the rest setting did not survive');
  assert.equal(resumable.resume.workoutLogId, ROW.id, 'a resume that writes to a new row would duplicate the workout');
});

test('2 Oct: a workout the user deliberately ended is never offered back', () => {
  assert.equal(toResumableWorkout({ ...ROW, ended_at: '2026-10-01T22:08:00Z' }, NOW), null);
  assert.equal(toResumableWorkout({ ...ROW, status: 'completed' }, NOW), null);
});

test('2 Oct: a stale workout past the resume window is not offered back', () => {
  assert.equal(toResumableWorkout(ROW, NOW + 25 * 60 * 60 * 1000), null);
});
