process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultTrainingDays,
  describeTrainingDays,
  firstTrainingDayOnOrAfter,
  parseTrainingDays,
  projectSchedule,
  resolveTrainingDays,
  type ScheduleLog,
} from './training-schedule.ts';
import { resolveTodaySession as serverResolve } from './brain-context.ts';
import { resolveTodaySession as clientResolve } from '../../../src/lib/resolveTodaySession.ts';

const session = (id: string, day_order: number) => ({ id, day_order, weekday: null, focus: id });

const DAMION = [
  session('upper_push_a', 1),
  session('lower_a', 2),
  session('upper_pull_a', 3),
  session('lower_b', 4),
  session('upper_push_b', 5),
  session('upper_pull_b', 6),
];
const MON_TO_SAT = [1, 2, 3, 4, 5, 6];

const log = (dateKey: string, plan_session_id: string, status = 'completed'): ScheduleLog => ({
  dateKey,
  at: `${dateKey}T18:00:00Z`,
  plan_session_id,
  status,
});

const project = (todayKey: string, logs: ScheduleLog[], fromKey: string, toKey: string, extra: Partial<Parameters<typeof projectSchedule>[0]> = {}) => {
  const restDayDates = extra.restDayDates ?? new Set<string>();
  const todayDue = clientResolve(
    DAMION,
    logs,
    new Date(`${todayKey}T12:00:00Z`),
    restDayDates,
    (extra.todayOverride as any) ?? null,
    extra.activeFromKey === undefined ? '2026-09-24' : extra.activeFromKey,
    MON_TO_SAT,
  );
  return projectSchedule({
    sessions: DAMION,
    trainingDays: MON_TO_SAT,
    logs,
    restDayDates,
    activeFromKey: '2026-09-24',
    todayKey,
    todayDue,
    fromKey,
    toKey,
    ...extra,
  });
};

const summary = (days: ReturnType<typeof project>) => days.map((d) => `${d.dateKey}:${d.session?.id ?? d.kind}:${d.status}`);

test('default training days are Monday-first consecutive days', () => {
  assert.deepEqual(defaultTrainingDays(6), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(defaultTrainingDays(3), [1, 2, 3]);
  assert.deepEqual(defaultTrainingDays(7), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(defaultTrainingDays(null), []);
});

test('parseTrainingDays accepts weekday names and abbreviations', () => {
  assert.deepEqual(parseTrainingDays(['Monday', 'wed', 'Friday']), [1, 3, 5]);
  assert.deepEqual(parseTrainingDays(['thurs', 'tues']), [2, 4]);
  assert.equal(parseTrainingDays(['someday']), null);
  assert.equal(parseTrainingDays([]), null);
  assert.equal(parseTrainingDays('monday'), null);
});

test('stored training days win over the days_per_week default', () => {
  assert.deepEqual(resolveTrainingDays({ training_days: [1, 3, 5], days_per_week: 3 }, DAMION), [1, 3, 5]);
  assert.deepEqual(resolveTrainingDays({ training_days: null, days_per_week: 6 }, DAMION), MON_TO_SAT);
});

test('describeTrainingDays names the rest days', () => {
  assert.equal(
    describeTrainingDays(MON_TO_SAT),
    'Training days: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday. Rest days: Sunday.',
  );
});

test("Damion's week: plan starts Thursday with Upper Push, Sunday is rest", () => {
  const days = project('2026-09-23', [], '2026-09-21', '2026-09-27');
  assert.deepEqual(summary(days), [
    '2026-09-21:not_started:rest',
    '2026-09-22:not_started:rest',
    '2026-09-23:not_started:rest',
    '2026-09-24:upper_push_a:upcoming',
    '2026-09-25:lower_a:upcoming',
    '2026-09-26:upper_pull_a:upcoming',
    '2026-09-27:rest:rest',
  ]);
});

test('the following week continues the rotation, not the weekday', () => {
  const days = project('2026-09-23', [], '2026-09-28', '2026-10-04');
  assert.deepEqual(
    days.map((d) => d.session?.id ?? 'rest'),
    ['lower_b', 'upper_push_b', 'upper_pull_b', 'upper_push_a', 'lower_a', 'upper_pull_a', 'rest'],
  );
});

test('a missed day stays next in the sequence and is kept as missed in history', () => {
  const logs = [log('2026-09-24', 'upper_push_a')];
  const days = project('2026-09-26', logs, '2026-09-24', '2026-09-28');
  assert.deepEqual(summary(days), [
    '2026-09-24:upper_push_a:completed',
    '2026-09-25:lower_a:missed',
    '2026-09-26:lower_a:due',
    '2026-09-27:rest:rest',
    '2026-09-28:upper_pull_a:upcoming',
  ]);
});

test('a scheduled rest day resolves to nothing due, on both server and client', () => {
  const sunday = new Date('2026-09-27T12:00:00Z');
  assert.equal(clientResolve(DAMION, [], sunday, new Set(), null, '2026-09-24', MON_TO_SAT), null);
  assert.equal(serverResolve(DAMION as any, [], sunday, new Set(), null, '2026-09-24', MON_TO_SAT), null);
  const monday = new Date('2026-09-28T12:00:00Z');
  assert.equal(clientResolve(DAMION, [], monday, new Set(), null, '2026-09-24', MON_TO_SAT)?.id, 'upper_push_a');
  assert.equal(serverResolve(DAMION as any, [], monday, new Set(), null, '2026-09-24', MON_TO_SAT)?.id, 'upper_push_a');
});

test('on a rest day the next training day gets the session that is due', () => {
  const logs = [log('2026-09-24', 'upper_push_a'), log('2026-09-25', 'lower_a'), log('2026-09-26', 'upper_pull_a')];
  const days = project('2026-09-27', logs, '2026-09-27', '2026-09-29');
  assert.deepEqual(summary(days), [
    '2026-09-27:rest:rest',
    '2026-09-28:lower_b:upcoming',
    '2026-09-29:upper_push_b:upcoming',
  ]);
});

test('a chosen rest day today pushes the due session to the next training day', () => {
  const logs = [log('2026-09-24', 'upper_push_a')];
  const days = project('2026-09-25', logs, '2026-09-25', '2026-09-26', { restDayDates: new Set(['2026-09-25']) });
  assert.deepEqual(summary(days), ['2026-09-25:chosen_rest:rest', '2026-09-26:lower_a:upcoming']);
});

test('completing today moves the next training day on', () => {
  const logs = [log('2026-09-24', 'upper_push_a'), log('2026-09-25', 'lower_a')];
  const days = project('2026-09-25', logs, '2026-09-25', '2026-09-26');
  assert.deepEqual(summary(days), ['2026-09-25:lower_a:completed', '2026-09-26:upper_pull_a:upcoming']);
});

test('a custom session today does not move the rotation', () => {
  const custom = { id: 'custom_arms', day_order: 0, weekday: null, focus: 'Arms' };
  const logs = [log('2026-09-24', 'upper_push_a')];
  const days = project('2026-09-25', logs, '2026-09-25', '2026-09-26', { todayOverride: custom as any });
  assert.deepEqual(summary(days), ['2026-09-25:custom_arms:due', '2026-09-26:lower_a:upcoming']);
});

test('an unfinished session held today is shown as partial and the rotation continues after it', () => {
  const logs = [log('2026-09-24', 'upper_push_a'), log('2026-09-25', 'lower_a', 'partial')];
  const days = project('2026-09-25', logs, '2026-09-25', '2026-09-26');
  assert.deepEqual(summary(days), ['2026-09-25:lower_a:partial', '2026-09-26:upper_pull_a:upcoming']);
});

test('the first training day on or after a date skips rest days', () => {
  assert.equal(firstTrainingDayOnOrAfter('2026-09-27', MON_TO_SAT), '2026-09-28');
  assert.equal(firstTrainingDayOnOrAfter('2026-09-24', MON_TO_SAT), '2026-09-24');
});
