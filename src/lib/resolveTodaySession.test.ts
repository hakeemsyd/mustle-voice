import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTodaySession, wasFinishedToday, type PlanSessionRow, type WorkoutLogRow } from './resolveTodaySession.ts';

const NOW = new Date('2026-10-01T22:00:00Z');

const session = (id: string, day_order: number, weekday: number | null = null): PlanSessionRow => ({ id, day_order, weekday });

const log = (planSessionId: string | null, status = 'completed', at = '2026-10-01T21:00:00Z'): WorkoutLogRow => ({
  id: `log-${planSessionId}-${at}`,
  at,
  plan_session_id: planSessionId,
  status,
  ended_at: at,
});

const openLog = (planSessionId: string, at = '2026-10-01T21:00:00Z'): WorkoutLogRow => ({
  id: `open-${planSessionId}`,
  at,
  plan_session_id: planSessionId,
  status: 'partial',
  ended_at: null,
  last_activity_at: at,
});

const PLAN = [session('push', 0), session('lower', 1), session('pull', 2)];

test('a one-off session the coach built outranks the rotation', () => {
  const custom = session('arms-custom', 0);
  assert.equal(resolveTodaySession(PLAN, [], NOW, new Set(), custom)?.id, 'arms-custom');
});

test('a one-off session is still offered after a DIFFERENT session was already finished today', () => {
  const custom = session('arms-custom', 0);
  const logs = [log('push')];
  assert.equal(
    resolveTodaySession(PLAN, logs, NOW, new Set(), custom)?.id,
    'arms-custom',
    'finishing the scheduled session must not hide an extra session built afterwards',
  );
});

test('a one-off session disappears once it is itself finished', () => {
  const custom = session('arms-custom', 0);
  assert.equal(resolveTodaySession(PLAN, [log('arms-custom')], NOW, new Set(), custom), null);
});

test('a one-off session left open mid-workout is still due, but one ended early is not', () => {
  const custom = session('arms-custom', 0);
  assert.equal(
    resolveTodaySession(PLAN, [openLog('arms-custom')], NOW, new Set(), custom)?.id,
    'arms-custom',
    'a workout still in its resume window is continuable, not done',
  );
  assert.equal(
    resolveTodaySession(PLAN, [log('arms-custom', 'partial')], NOW, new Set(), custom),
    null,
    'a partial that was explicitly ended closes the day',
  );
});

test('with no override, finishing today leaves nothing further due', () => {
  assert.equal(resolveTodaySession(PLAN, [log('push')], NOW), null);
  assert.equal(resolveTodaySession(PLAN, [], NOW)?.id, 'push', 'with nothing logged the rotation starts at the first session');
});

test('a one-off session beats a rest day', () => {
  const custom = session('arms-custom', 0);
  const restDays = new Set(['2026-10-01', '2026-10-02']);
  assert.equal(resolveTodaySession(PLAN, [], NOW, restDays, custom)?.id, 'arms-custom');
  assert.equal(resolveTodaySession(PLAN, [], NOW, restDays), null, 'without the override the rest day stands');
});

test('wasFinishedToday only counts a finished log for that same session, on that day', () => {
  assert.equal(wasFinishedToday([log('push')], 'push', NOW), true);
  assert.equal(wasFinishedToday([log('push')], 'lower', NOW), false);
  assert.equal(wasFinishedToday([openLog('push')], 'push', NOW), false);
  assert.equal(wasFinishedToday([log('push', 'partial')], 'push', NOW), true, 'ended early still ends the day');
  assert.equal(wasFinishedToday([log('push', 'completed', '2026-09-30T21:00:00Z')], 'push', NOW), false);
});
