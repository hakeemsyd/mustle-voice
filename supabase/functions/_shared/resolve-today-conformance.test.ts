process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTodaySession as serverResolve } from './brain-context.ts';
import { resolveTodaySession as clientResolve } from '../../../src/lib/resolveTodaySession.ts';

interface Case {
  name: string;
  sessions: any[];
  logs: any[];
  now: Date;
  restDayDates?: Set<string>;
  dayOverride?: any;
  planStartDate?: string | null;
  expected: string | null;
}

const session = (id: string, day_order: number, weekday: number | null) => ({
  id,
  day_order,
  weekday,
  focus: id,
});

const log = (at: string, plan_session_id: string, status: string) => ({ at, plan_session_id, status });

const PUSH_PULL_LEGS = [session('push', 0, null), session('pull', 1, null), session('legs', 2, null)];
const PINNED = [session('mon', 0, 1), session('wed', 1, 3), session('fri', 2, 5)];

const MONDAY = new Date('2026-09-14T12:00:00Z');
const TUESDAY = new Date('2026-09-15T12:00:00Z');

const cases: Case[] = [
  { name: 'pinned plan matches by weekday', sessions: PINNED, logs: [], now: MONDAY, expected: 'mon' },
  { name: 'pinned plan with no match is a rest day', sessions: PINNED, logs: [], now: TUESDAY, expected: null },
  { name: 'flexible split with no logs starts at day_order 0', sessions: PUSH_PULL_LEGS, logs: [], now: MONDAY, expected: 'push' },
  {
    name: 'completed yesterday advances the rotation',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-13T18:00:00Z', 'push', 'completed')],
    now: MONDAY,
    expected: 'pull',
  },
  {
    name: 'completed today ends the day',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-14T09:00:00Z', 'push', 'completed')],
    now: MONDAY,
    expected: null,
  },
  {
    name: 'partial TODAY is offered back to resume',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-14T09:00:00Z', 'push', 'partial')],
    now: MONDAY,
    expected: 'push',
  },
  {
    name: 'pinned plan completed today stops showing as upcoming',
    sessions: PINNED,
    logs: [log('2026-09-14T09:00:00Z', 'mon', 'completed')],
    now: MONDAY,
    expected: null,
  },
  {
    name: 'pinned plan only PARTLY done today is still offered back',
    sessions: PINNED,
    logs: [log('2026-09-14T09:00:00Z', 'mon', 'partial')],
    now: MONDAY,
    expected: 'mon',
  },
  {
    name: 'a custom session completed today stops showing as upcoming',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-14T09:00:00Z', 'custom', 'completed')],
    now: MONDAY,
    dayOverride: session('custom', 0, null),
    expected: null,
  },
  {
    name: 'a custom session still stands after an UNRELATED session was completed today',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-14T09:00:00Z', 'push', 'completed')],
    now: MONDAY,
    dayOverride: session('custom', 0, null),
    expected: 'custom',
  },
  {
    name: 'THE DIVERGENCE: partial YESTERDAY lapses and the rotation moves on',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-13T18:00:00Z', 'push', 'partial')],
    now: MONDAY,
    expected: 'pull',
  },
  {
    name: 'interrupted YESTERDAY lapses the same way',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-13T18:00:00Z', 'push', 'interrupted')],
    now: MONDAY,
    expected: 'pull',
  },
  {
    name: 'interrupted TODAY is offered back',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-14T09:00:00Z', 'push', 'interrupted')],
    now: MONDAY,
    expected: 'push',
  },
  {
    name: 'a finished row wins a timestamp tie against a partial one',
    sessions: PUSH_PULL_LEGS,
    logs: [
      log('2026-09-13T18:00:00Z', 'push', 'partial'),
      log('2026-09-13T18:00:00Z', 'push', 'completed'),
    ],
    now: MONDAY,
    expected: 'pull',
  },
  {
    name: 'an explicit rest day beats the rotation',
    sessions: PUSH_PULL_LEGS,
    logs: [],
    now: MONDAY,
    restDayDates: new Set(['2026-09-14']),
    expected: null,
  },
  {
    name: 'a day override outranks a rest day',
    sessions: PUSH_PULL_LEGS,
    logs: [],
    now: MONDAY,
    restDayDates: new Set(['2026-09-14']),
    dayOverride: session('custom', 99, null),
    expected: 'custom',
  },
  {
    name: 'a log for a session not in the plan restarts the rotation',
    sessions: PUSH_PULL_LEGS,
    logs: [log('2026-09-13T18:00:00Z', 'deleted-session', 'completed')],
    now: MONDAY,
    expected: 'push',
  },
  { name: 'no sessions and no override is null', sessions: [], logs: [], now: MONDAY, expected: null },
  {
    name: "a flexible plan not yet started never hands back day 0 (Damion's bug)",
    sessions: PUSH_PULL_LEGS,
    logs: [],
    now: MONDAY,
    planStartDate: '2026-09-15',
    expected: null,
  },
  {
    name: 'a pinned plan matching weekday but not yet started is not due either',
    sessions: PINNED,
    logs: [],
    now: MONDAY,
    planStartDate: '2026-09-15',
    expected: null,
  },
  {
    name: 'the start date itself is a valid training day (< not <=)',
    sessions: PUSH_PULL_LEGS,
    logs: [],
    now: MONDAY,
    planStartDate: '2026-09-14',
    expected: 'push',
  },
  {
    name: 'a start date already in the past never gates an already-running plan',
    sessions: PUSH_PULL_LEGS,
    logs: [],
    now: MONDAY,
    planStartDate: '2026-09-01',
    expected: 'push',
  },
  {
    name: 'a day override still wins even before the plan has started',
    sessions: PUSH_PULL_LEGS,
    logs: [],
    now: MONDAY,
    planStartDate: '2026-09-15',
    dayOverride: session('custom', 99, null),
    expected: 'custom',
  },
];

for (const c of cases) {
  test(`app and coach agree: ${c.name}`, () => {
    const rest = c.restDayDates ?? new Set<string>();
    const override = c.dayOverride ?? null;
    const planStartDate = c.planStartDate ?? null;
    const server = serverResolve(c.sessions, c.logs, c.now, rest, override, planStartDate);
    const client = clientResolve(c.sessions, c.logs, c.now, rest, override, planStartDate);

    assert.equal(server?.id ?? null, c.expected, 'coach (brain-context) disagrees with the expected answer');
    assert.equal(client?.id ?? null, c.expected, 'app (resolveTodaySession) disagrees with the expected answer');
    assert.equal(server?.id ?? null, client?.id ?? null, 'app and coach resolved different sessions');
  });
}
