import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeLiveSessionSnapshot as serverDescribe } from './live-session-format.ts';
import { describeLiveSessionSnapshot as clientDescribe } from '../../../src/session/liveSessionState.ts';

const snapshot = (loggedSets: any[]) => ({
  target: { type: 'plan_session' as const, planSessionId: 's1' },
  focus: 'upper_push',
  status: 'training' as const,
  elapsedSec: 600,
  currentExercise: {
    name: 'Overhead Press',
    setIndex: 0,
    totalSets: 3,
    repScheme: '6-8',
    loadScheme: '34 kg',
    loggedSets,
  },
  upcomingExercises: ['Lateral Raise'],
  restTargetSec: null,
  restRemainingSec: null,
});

const bothCopies = [
  { label: 'server', describe: serverDescribe },
  { label: 'client', describe: clientDescribe },
] as const;

for (const { label, describe } of bothCopies) {
  test(`${label}: an imperial user is never read their weights in kilograms`, () => {
    const block = describe(snapshot([{ weight: 34, reps: 8 }]) as any, 'imperial');
    assert.match(block, /75 lb×8/);
    assert.doesNotMatch(block, /\d+\s*kg/);
  });

  test(`${label}: a kg load scheme from the plan is converted too`, () => {
    const block = describe(snapshot([]) as any, 'imperial');
    assert.match(block, /load 75 lb/);
  });

  test(`${label}: a load scheme range converts both ends`, () => {
    const snap = snapshot([]) as any;
    snap.currentExercise.loadScheme = '60-70 kg';
    assert.match(describe(snap, 'imperial'), /load 132\.3-154\.3 lb/);
  });

  test(`${label}: a load scheme with no number is left alone`, () => {
    const snap = snapshot([]) as any;
    snap.currentExercise.loadScheme = 'empty bar to start';
    assert.match(describe(snap, 'imperial'), /load empty bar to start/);
  });

  test(`${label}: a metric user still gets kilograms`, () => {
    const block = describe(snapshot([{ weight: 60, reps: 5 }]) as any, 'metric');
    assert.match(block, /60 kg×5/);
    assert.doesNotMatch(block, /lb/);
  });

  test(`${label}: units default to metric when the caller omits them`, () => {
    assert.match(describe(snapshot([{ weight: 60, reps: 5 }]) as any), /60 kg×5/);
  });

  test(`${label}: bodyweight and timed holds carry no unit either way`, () => {
    const block = describe(
      snapshot([
        { weight: null, reps: 12 },
        { weight: null, reps: 45, unit: 'seconds' },
      ]) as any,
      'imperial',
    );
    assert.match(block, /bodyweight×12/);
    assert.match(block, /45s held/);
  });
}

test('both copies format the same snapshot identically', () => {
  for (const units of ['metric', 'imperial'] as const) {
    const sets = [{ weight: 34, reps: 8 }, { weight: null, reps: 12 }];
    assert.equal(
      serverDescribe(snapshot(sets) as any, units),
      clientDescribe(snapshot(sets) as any, units),
      `copies diverged for ${units}`,
    );
  }
});
