import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDayMentions, lookupDayWorkout, nextTrainingDayAfter, type DayWorkoutSession } from './day-workout.ts';

const MONDAY = '2026-09-28';

const session = (id: string, dayOrder: number, focus: string, weekday: number | null = null): DayWorkoutSession => ({
  id,
  day_order: dayOrder,
  weekday,
  focus,
  plan_exercise: [
    { ord: 2, sets: 3, rep_scheme: '10-12', exercise: { name: `${focus} accessory` } },
    { ord: 1, sets: 4, rep_scheme: '5', exercise: { name: `${focus} main` } },
  ],
});

const PUSH = session('push', 1, 'upper_push');
const LOWER = session('lower', 2, 'lower');
const PULL = session('pull', 3, 'upper_pull');

const log = (dateKey: string, planSessionId: string, status = 'completed') => ({
  dateKey,
  at: `${dateKey}T18:00:00.000Z`,
  plan_session_id: planSessionId,
  status,
});

const lookup = (day: string | null, overrides: Partial<Parameters<typeof lookupDayWorkout<DayWorkoutSession>>[0]> = {}) =>
  lookupDayWorkout<DayWorkoutSession>({
    day,
    todayKey: MONDAY,
    sessions: [PUSH, LOWER, PULL],
    trainingDays: [1, 3, 5],
    logs: [log('2026-09-21', 'push'), log('2026-09-25', 'pull')],
    restDayDates: new Set(),
    activeFromKey: '2026-09-01',
    todayDue: PUSH,
    todayOverride: null,
    restSecondsFor: (reps) => (reps === '5' ? 150 : 90),
    ...overrides,
  }) as any;

test('no day, or "today", keeps the card it always showed', () => {
  for (const day of [null, 'today']) {
    const result = lookup(day);
    assert.equal(result.status, 'shown');
    assert.equal(result.card.plan_session_id, 'push');
    assert.equal(result.card.day_label, 'Today · Upper Push');
    assert.equal(result.card.is_today, true);
    assert.deepEqual(result.card.exercises.map((e: any) => e.name), ['upper_push main', 'upper_push accessory']);
    assert.equal(result.instruction, undefined);
  }
});

test('tomorrow is a rest day on a Mon/Wed/Fri plan, and names the next training day', () => {
  const result = lookup('tomorrow');
  assert.equal(result.status, 'no_session');
  assert.equal(result.reason, 'rest_day');
  assert.equal(result.day, 'Tomorrow (Tuesday, Sep 29)');
  assert.equal(result.next_training_day, 'Wednesday, Sep 30 (Lower)');
});

test('a future training day shows that day\'s session, not today\'s', () => {
  const wednesday = lookup('Wednesday');
  assert.equal(wednesday.status, 'shown');
  assert.equal(wednesday.card.plan_session_id, 'lower');
  assert.equal(wednesday.card.day_label, 'Wed, Sep 30 · Lower');
  assert.equal(wednesday.card.is_today, false);
  assert.match(wednesday.instruction, /Wednesday, Sep 30/);

  assert.equal(lookup('friday').card.plan_session_id, 'pull');
  assert.equal(lookup('next monday').card.plan_session_id, 'push');
  assert.equal(lookup('Oct 14').card.plan_session_id, 'lower');
  assert.equal(lookup('16th of October').card.day_label, 'Fri, Oct 16 · Upper Pull');
});

test('next Sunday and Oct 15 are rest days here', () => {
  const sunday = lookup('next Sunday');
  assert.equal(sunday.reason, 'rest_day');
  assert.equal(sunday.day, 'Sunday, Oct 4');
  assert.equal(sunday.next_training_day, 'Monday, Oct 5 (Upper Push)');
  assert.equal(lookup('15th of Oct').day, 'Thursday, Oct 15');
  assert.equal(lookup('15th of Oct').reason, 'rest_day');
});

test('a rest day the user chose moves the rotation', () => {
  const restDayDates = new Set(['2026-09-30']);
  assert.equal(lookup('wednesday', { restDayDates }).reason, 'chosen_rest_day');
  assert.equal(lookup('friday', { restDayDates }).card.plan_session_id, 'lower');
});

test('pinned plans use the weekday, with no rotation caveat', () => {
  const pinned = [session('mon', 1, 'push', 1), session('thu', 2, 'pull', 4)];
  const result = lookup('thursday', { sessions: pinned, trainingDays: [1, 4], todayDue: pinned[0] });
  assert.equal(result.card.plan_session_id, 'thu');
  assert.doesNotMatch(result.instruction, /rotation/);
  assert.match(lookup('wednesday').instruction, /rotation/);
});

test('past days report what happened instead of offering a workout', () => {
  const friday = lookup('2026-09-25');
  assert.equal(friday.status, 'past_day');
  assert.equal(friday.outcome, 'completed');
  assert.equal(friday.session, 'Upper Pull');
  assert.equal(friday.card, undefined);

  const missed = lookup('Sep 23');
  assert.equal(missed.outcome, 'missed');
  assert.equal(missed.session, 'Lower');

  assert.equal(lookup('yesterday').outcome, 'rest');
});

test('before the plan starts, nothing is scheduled', () => {
  const result = lookup('tomorrow', { activeFromKey: '2026-10-01', todayDue: null, logs: [] });
  assert.equal(result.reason, 'plan_not_started');
  assert.match(result.instruction, /Thursday, Oct 1/);
  assert.equal(lookup('friday', { activeFromKey: '2026-10-01', todayDue: null, logs: [] }).card.plan_session_id, 'push');
});

test('unclear, far-away and plan-less requests never guess', () => {
  assert.equal(lookup('someday').status, 'not_understood');
  assert.equal(lookup('in 400 days').status, 'not_in_range');
  assert.equal(lookup('tomorrow', { sessions: [], todayDue: null }).reason, 'no_active_plan');
});

test('a custom session only replaces today', () => {
  const custom = session('custom', 99, 'arms');
  const today = lookup('today', { todayDue: custom, todayOverride: custom });
  assert.equal(today.card.plan_session_id, 'custom');
  assert.equal(lookup('wednesday', { todayDue: custom, todayOverride: custom }).card.plan_session_id, 'push');
});

test('swapping today for a custom session pushes the due session to the next training day', () => {
  const sessions = [PUSH, LOWER, PULL];
  const base = {
    todayKey: MONDAY,
    sessions,
    trainingDays: [1, 2, 3, 4, 5],
    logs: [log('2026-09-25', 'lower', 'partial')],
    restDayDates: new Set<string>(),
    activeFromKey: '2026-09-01',
    restSecondsFor: () => 90,
  };
  assert.equal(nextTrainingDayAfter({ ...base, todayDue: PULL, todayOverride: null }, MONDAY), 'Tomorrow (Tuesday, Sep 29) (Upper Push)');
  const custom = session('pending', 0, 'arms');
  assert.equal(nextTrainingDayAfter({ ...base, todayDue: custom, todayOverride: custom }, MONDAY), 'Tomorrow (Tuesday, Sep 29) (Upper Pull)');
});

test('days named in a message become facts in the turn context', () => {
  const schedule = {
    todayKey: MONDAY,
    sessions: [PUSH, LOWER, PULL],
    trainingDays: [1, 3, 5],
    logs: [log('2026-09-21', 'push'), log('2026-09-25', 'pull', 'partial')],
    restDayDates: new Set<string>(),
    activeFromKey: '2026-09-01',
    todayDue: PUSH,
    todayOverride: null,
    restSecondsFor: () => 90,
  };
  const note = describeDayMentions('what was i supposed to do friday the 25th', schedule, null)!;
  assert.match(note, /"friday the 25th" is Friday, Sep 25 \(already over\)\. They started Upper Pull but did not finish it\./);
  assert.match(note, /never say you cannot see a day/);

  const future = describeDayMentions('what about oct 14 and next sunday?', schedule, null)!;
  assert.match(future, /"oct 14" is Wednesday, Oct 14\. Scheduled: Lower \(lower main, lower accessory\)\./);
  assert.match(future, /"next sunday" is Sunday, Oct 4\. A rest day in their plan\. Next training day after it: Monday, Oct 5 \(Upper Push\)\./);

  assert.match(describeDayMentions('what did i do on sep 2', schedule, '2026-09-10')!, /older than the workout history loaded here/);
  assert.equal(describeDayMentions('done 40/8', schedule, null), null);
  assert.equal(describeDayMentions("what's today", schedule, null), null);
});
