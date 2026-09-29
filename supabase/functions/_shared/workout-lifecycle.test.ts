import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endsTheDay, followupAskedRecently, isOpenWorkout, needsFollowup, timedOut } from './workout-lifecycle.ts';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

test('a workout they left can be continued for 24 hours after its last set, then closes', () => {
  const left = { at: hoursAgo(30), status: 'partial', last_activity_at: hoursAgo(23) };
  assert.equal(isOpenWorkout(left, NOW), true);
  assert.equal(endsTheDay(left, NOW), false);
  const stale = { ...left, last_activity_at: hoursAgo(25) };
  assert.equal(isOpenWorkout(stale, NOW), false);
  assert.equal(timedOut(stale, NOW), true);
  assert.equal(needsFollowup(stale, NOW), true, 'the coach asks how the rest of it went');
});

test('ending early closes it at once and never triggers the welcome-back question', () => {
  const ended = { at: hoursAgo(2), status: 'partial', last_activity_at: hoursAgo(2), ended_at: hoursAgo(2), ended_by: 'user' };
  assert.equal(isOpenWorkout(ended, NOW), false);
  assert.equal(endsTheDay(ended, NOW), true);
  assert.equal(needsFollowup(ended, NOW), false);
});

test('the follow-up is asked once and stops once settled or old', () => {
  const closed = { at: hoursAgo(40), status: 'partial', last_activity_at: hoursAgo(40), ended_at: hoursAgo(16), ended_by: 'timeout' };
  assert.equal(needsFollowup(closed, NOW), true);
  const asked = { ...closed, followup_asked_at: hoursAgo(1) };
  assert.equal(followupAskedRecently(asked, NOW), true);
  assert.equal(needsFollowup({ ...asked, followup_resolved_at: hoursAgo(0.5) }, NOW), false);
  assert.equal(needsFollowup({ ...closed, last_activity_at: hoursAgo(24 * 8) }, NOW), false, 'a week-old one is not raised');
  assert.equal(isOpenWorkout({ at: hoursAgo(1), status: 'completed' }, NOW), false);
});
