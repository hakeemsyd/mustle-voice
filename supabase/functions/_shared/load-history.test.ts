import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLoadHistory, describeLoadHistory } from './load-history.ts';

const log = (at: string, done: unknown[]) => ({ at, exercises_done: done });

test('the most recent log wins per exercise', () => {
  const history = buildLoadHistory([
    log('2026-09-19T10:00:00Z', [{ name: 'Bench Press', reps: '8,8', load: '60,62.5' }]),
    log('2026-09-12T10:00:00Z', [{ name: 'Bench Press', reps: '8', load: '55' }]),
  ]);
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], {
    name: 'Bench Press',
    at: '2026-09-19T10:00:00Z',
    weightKg: 62.5,
    reps: 8,
    sets: 2,
  });
});

test('the last set of the session is the load carried forward', () => {
  const [entry] = buildLoadHistory([
    log('2026-09-19T10:00:00Z', [{ name: 'Squat', reps: '10,8,6', load: '60,70,80' }]),
  ]);
  assert.equal(entry.weightKg, 80);
  assert.equal(entry.reps, 6);
  assert.equal(entry.sets, 3);
});

test('bodyweight keeps its rep count instead of being dropped', () => {
  const [entry] = buildLoadHistory([
    log('2026-09-19T10:00:00Z', [{ name: 'Push-up', reps: '12,12', load: 'bodyweight' }]),
  ]);
  assert.equal(entry.weightKg, null);
  assert.equal(entry.reps, 12);
});

test('matching is case-insensitive and rubbish rows are skipped', () => {
  const history = buildLoadHistory([
    log('2026-09-19T10:00:00Z', [{ name: 'bench press', reps: '8', load: '60' }, { reps: '8' }]),
    log('2026-09-12T10:00:00Z', [{ name: 'Bench Press', reps: '8', load: '55' }]),
  ]);
  assert.equal(history.length, 1);
  assert.equal(history[0].weightKg, 60);
});

test('it reads back in the user units', () => {
  const history = buildLoadHistory([
    log('2026-09-19T10:00:00Z', [{ name: 'Incline Dumbbell Press', reps: '8', load: '34' }]),
  ]);
  assert.match(describeLoadHistory(history, 'imperial')!, /Incline Dumbbell Press: 75 lb x 8 reps/);
  assert.match(describeLoadHistory(history, 'metric')!, /Incline Dumbbell Press: 34 kg x 8 reps/);
});

test('no history produces no line at all', () => {
  assert.equal(describeLoadHistory(buildLoadHistory([]), 'imperial'), null);
  assert.equal(describeLoadHistory(buildLoadHistory([log('2026-09-19T10:00:00Z', [])]), 'imperial'), null);
});

test('an unlisted exercise is explicitly a genuine first time', () => {
  const history = buildLoadHistory([log('2026-09-19T10:00:00Z', [{ name: 'Squat', reps: '8', load: '60' }])]);
  assert.match(describeLoadHistory(history, 'metric')!, /NOT listed here has genuinely never been/);
});
