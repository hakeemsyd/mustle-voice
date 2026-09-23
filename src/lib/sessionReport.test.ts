import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSetLog, computeVolume, buildTopSetLabel, buildSessionReport } from './sessionReport';

test('a coach-logged exercise applies its single weight and reps to every set', () => {
  const rows = buildSetLog([
    { name: 'Bench Press', sets: 3, reps: '6', load: '43.1', tracked: 'reported' },
  ]);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.weight, 43.1);
    assert.equal(row.reps, 6);
  }
});

test('volume counts every set, not just the first', () => {
  const rows = buildSetLog([{ name: 'Bench Press', sets: 3, reps: '6', load: '43.1' }]);
  assert.equal(Math.round(computeVolume(rows)), Math.round(43.1 * 6 * 3));
});

test('per-set values are still respected when the app logs each set live', () => {
  const rows = buildSetLog([
    { name: 'Squat', sets: 3, reps: '8,7,5', load: '60,62.5,65', tracked: 'live' },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.weight, r.reps]),
    [
      [60, 8],
      [62.5, 7],
      [65, 5],
    ],
  );
});

test('a partially reported exercise leaves the unknown sets blank rather than inventing them', () => {
  const rows = buildSetLog([{ name: 'Squat', sets: 3, reps: '8,7', load: '60,62.5' }]);
  assert.deepEqual(
    rows.map((r) => [r.weight, r.reps]),
    [
      [60, 8],
      [62.5, 7],
      [null, null],
    ],
  );
});

test('bodyweight work carries reps across every set with no weight', () => {
  const rows = buildSetLog([{ name: 'Push-up', sets: 3, reps: '12', load: 'bodyweight' }]);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.weight, null);
    assert.equal(row.reps, 12);
  }
  assert.equal(computeVolume(rows), 0);
});

test('the top set is reported in the reader units', () => {
  const rows = buildSetLog([{ name: 'Bench Press', sets: 3, reps: '6', load: '43.1' }]);
  assert.equal(buildTopSetLabel(rows, 'imperial'), '95 lb × 6');
  assert.equal(buildTopSetLabel(rows, 'metric'), '43.1 kg × 6');
});

const partialLog = (note: string | null, tags: string[] | null) => ({
  id: 'w1',
  at: '2026-09-19T11:15:50Z',
  status: 'partial',
  source: 'mustle',
  session_type: 'strength',
  cardio_activity: null,
  duration_sec: 26,
  plan_session_id: 'p1',
  exercises_done: [{ name: 'Push-up', sets: 2, reps: '12,15', load: 'bodyweight' }],
  note,
  feedback_tags: tags,
});

test('a tapped reason chip reaches the debrief, not just the database', () => {
  const report = buildSessionReport(partialLog(null, ['Ran out of time']) as never, null, [], 1, null);
  assert.match(report.debrief.summary, /ran out of time\./);
});

test('free text still wins over the chips', () => {
  const report = buildSessionReport(
    partialLog('Had to pick up the kids', ['Ran out of time']) as never,
    null,
    [],
    1,
    null,
  );
  assert.match(report.debrief.summary, /Had to pick up the kids\./);
});

test('several chips read as one sentence', () => {
  const report = buildSessionReport(partialLog(null, ['Too tired', 'Gym too busy']) as never, null, [], 1, null);
  assert.match(report.debrief.summary, /too tired and gym too busy\./);
});

test('no reason given leaves the summary clean, with no dangling dash', () => {
  const report = buildSessionReport(partialLog(null, null) as never, null, [], 1, null);
  assert.match(report.debrief.summary, /planned sets on training\. First tracked/);
});

test('a pain chip still raises the injury check', () => {
  const report = buildSessionReport(partialLog(null, ['Felt pain']) as never, null, [], 1, null);
  assert.ok(report.debrief.injuryCheck);
});
