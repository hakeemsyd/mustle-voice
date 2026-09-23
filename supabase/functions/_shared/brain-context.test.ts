import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeUserName, resolveTodaySession, startOfLocalDayUtc } from './brain-context.ts';

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

test('a partial session from today does not advance the rotation — it is offered back', () => {
  const sessions = [session('push', 0, null), session('pull', 1, null)];
  const logs = [{ at: '2026-08-11T09:00:00Z', plan_session_id: 'push', status: 'partial' }];
  assert.equal(resolveTodaySession(sessions, logs, new Date('2026-08-11T12:00:00Z'))?.id, 'push');
});

test('a partial session from an earlier day lapses and the rotation moves on', () => {
  const sessions = [session('push', 0, null), session('pull', 1, null)];
  const logs = [{ at: '2026-08-10T00:00:00Z', plan_session_id: 'push', status: 'partial' }];
  assert.equal(resolveTodaySession(sessions, logs, new Date('2026-08-11T12:00:00Z'))?.id, 'pull');
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

const EVENING_IN_NEW_YORK = new Date('2026-09-19T00:00:00Z');

test("a user's local day starts at their own midnight, not UTC's", () => {
  const dayStart = startOfLocalDayUtc('America/New_York', EVENING_IN_NEW_YORK);
  assert.equal(dayStart.toISOString(), '2026-09-18T04:00:00.000Z');
});

test('an evening message on the same local day survives the boundary', () => {
  const dayStart = startOfLocalDayUtc('America/New_York', EVENING_IN_NEW_YORK).getTime();
  const saidThisEvening = new Date('2026-09-18T22:00:00Z').getTime();
  assert.ok(saidThisEvening >= dayStart);
  const utcDayStart = startOfLocalDayUtc(null, EVENING_IN_NEW_YORK).getTime();
  assert.ok(saidThisEvening < utcDayStart);
});

test('yesterday is still excluded once the timezone is applied', () => {
  const dayStart = startOfLocalDayUtc('America/New_York', EVENING_IN_NEW_YORK).getTime();
  const lastNight = new Date('2026-09-18T01:00:00Z').getTime();
  assert.ok(lastNight < dayStart);
});

test('a stored name is handed to the coach every turn, with an explicit ban on asking for it', () => {
  const line = describeUserName('Damion');
  assert.ok(line.includes('Damion'));
  assert.ok(/never ask what to call them/.test(line));
});

test('a blank or whitespace-only name is treated as no name, not as a name', () => {
  for (const value of [null, undefined, '', '   ']) {
    assert.ok(describeUserName(value).startsWith('No name on file'));
  }
});

test('with no name the coach is told to ask once and then persist it', () => {
  assert.ok(/update_profile/.test(describeUserName(null)));
});

test('a transcription artifact stored as a name is never read back as one', () => {
  for (const junk of ['[background Noise]', '[szum]', '(inaudible)', 'test']) {
    assert.ok(describeUserName(junk).startsWith('No name on file'), junk);
  }
});
