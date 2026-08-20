import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTodaySession } from './brain-context.ts';

const session = (id: string, day_order: number, weekday: number | null, focus = id) => ({
  id,
  day_order,
  weekday,
  focus,
});

test('weekday-pinned plan matches today by weekday', () => {
  const sessions = [session('mon', 0, 1), session('wed', 1, 3), session('fri', 2, 5)];
  const monday = new Date('2026-08-17T12:00:00Z');
  assert.equal(resolveTodaySession(sessions, [], monday)?.id, 'mon');
});

test('weekday-pinned plan with no match today is a real rest day', () => {
  const sessions = [session('mon', 0, 1), session('wed', 1, 3)];
  const tuesday = new Date('2026-08-18T12:00:00Z');
  assert.equal(resolveTodaySession(sessions, [], tuesday), null);
});

test('flexible split with no logs starts at day_order 0', () => {
  const sessions = [session('push', 0, null), session('pull', 1, null), session('legs', 2, null)];
  assert.equal(resolveTodaySession(sessions, [], new Date())?.id, 'push');
});

test('flexible split advances the rotation after a completed session', () => {
  const sessions = [session('push', 0, null), session('pull', 1, null), session('legs', 2, null)];
  const logs = [{ at: '2026-08-10T00:00:00Z', plan_session_id: 'push', status: 'completed' }];
  assert.equal(resolveTodaySession(sessions, logs, new Date('2026-08-11T12:00:00Z'))?.id, 'pull');
});

test('a partial session does not advance the rotation — it is offered back', () => {
  const sessions = [session('push', 0, null), session('pull', 1, null)];
  const logs = [{ at: '2026-08-10T00:00:00Z', plan_session_id: 'push', status: 'partial' }];
  assert.equal(resolveTodaySession(sessions, logs, new Date('2026-08-11T12:00:00Z'))?.id, 'push');
});

test('a session completed earlier today yields a rest day, not a repeat', () => {
  const now = new Date();
  const loggedMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const sessions = [session('push', 0, null), session('pull', 1, null)];
  const logs = [{ at: loggedMinutesAgo.toISOString(), plan_session_id: 'push', status: 'completed' }];
  assert.equal(resolveTodaySession(sessions, logs, now), null);
});

test('a mixed plan (any pinned weekday) keeps real rest days instead of rotating', () => {
  const sessions = [session('mon', 0, 1), session('flex', 1, null)];
  const tuesday = new Date('2026-08-18T12:00:00Z');
  assert.equal(resolveTodaySession(sessions, [], tuesday), null);
});
