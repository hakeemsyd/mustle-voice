import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveSessionSnapshot } from './live-session-format.ts';
import {
  describeCueFacts,
  describeResumedStart,
  describeTypedTurnSetOutcome,
  resolveTurnSetOutcome,
} from './turn-set-outcome.ts';
import { guardClaims, isSuccessfulToolResult, isUnbackedClaim, type ClaimGuardState } from './claim-guard.ts';

const pushUps = (loggedSets: any[] = [], extra: Record<string, unknown> = {}) =>
  buildLiveSessionSnapshot({
    target: { type: 'strength', planSessionId: 'b703a8da' },
    focus: 'Upper Push',
    exercises: [
      { id: 'a', exerciseId: 'x', name: 'Push-up', sets: 4, repScheme: '8-12', loadScheme: 'bodyweight' },
      { id: 'b', exerciseId: 'y', name: 'Tricep Dip', sets: 3, repScheme: '6-10', loadScheme: 'bodyweight' },
      { id: 'c', exerciseId: 'z', name: 'Plank', sets: 3, repScheme: '30-45 seconds', loadScheme: 'bodyweight' },
    ],
    currentExerciseIndex: 0,
    loggedSets: [loggedSets, [], []],
    resting: false,
    restTargetSec: 90,
    restEndAt: null,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 12,
    ...extra,
  } as any);

const benchPress = () =>
  buildLiveSessionSnapshot({
    target: { type: 'strength', planSessionId: '61a46e23' },
    focus: 'Upper Push',
    exercises: [
      { id: 'a', exerciseId: 'x', name: 'Bench Press', sets: 4, repScheme: '5-6', loadScheme: 'find your working weight' },
      { id: 'b', exerciseId: 'y', name: 'Incline Dumbbell Press', sets: 3, repScheme: '8-10', loadScheme: null },
    ],
    currentExerciseIndex: 0,
    loggedSets: [[], []],
    resting: false,
    restTargetSec: 90,
    restEndAt: null,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 20,
  } as any);

const outcome = (userText: string, snapshot = pushUps(), extra: Record<string, unknown> = {}) =>
  resolveTurnSetOutcome({ userText, snapshot, units: 'imperial', ...extra });

test("Damion's push-up turn: the app logs it and the coach is told so", () => {
  const result = outcome('All right. I said I just did 10 push-ups.');
  assert.equal(result?.kind, 'logged');
  assert.deepEqual(result?.set, { weight: null, reps: 10 });
  assert.match(result!.note, /LOGGED this message as set 1 of 4 on Push-up: 10 reps/);
  assert.match(result!.note, /rest has started/);
  assert.match(result!.note, /Do not ask them to confirm it/);
});

test("Damion's follow-up 'I just did ten' also logs", () => {
  assert.equal(outcome('I just told you, I just did ten.')?.kind, 'logged');
});

test("Damion's bench turn: a planned rep count is reported as not logged", () => {
  const result = outcome("I'll do about 10 reps", benchPress());
  assert.equal(result?.kind, 'not_logged');
  assert.match(result!.note, /NOTHING was logged/);
  assert.match(result!.note, /do not say rest is starting/);
});

test('a stated weight is noted without logging', () => {
  const result = outcome('75 pounds', benchPress());
  assert.equal(result?.kind, 'stated_weight');
  assert.match(result!.note, /34 kg|75 lb|74\.\d lb/);
  assert.match(result!.note, /set 1 has not happened yet/);
});

test('a bare count only logs when the coach just asked for it', () => {
  assert.equal(outcome('10 reps')?.kind, 'not_logged');
  const asked = outcome('10 reps', pushUps(), {
    lastCoachMessage: { content: 'How many reps did you get?', at: new Date().toISOString() },
  });
  assert.equal(asked?.kind, 'logged');
  const stale = outcome('10 reps', pushUps(), {
    lastCoachMessage: { content: 'How many reps did you get?', at: new Date(Date.now() - 5 * 60_000).toISOString() },
  });
  assert.equal(stale?.kind, 'not_logged');
});

test('counting out loud is never a set', () => {
  assert.equal(outcome('Eight, nine, ten.')?.kind, 'not_logged');
});

test('a completion without numbers asks for the reps', () => {
  const result = outcome('Done.');
  assert.equal(result?.kind, 'needs_details');
  assert.match(result!.note, /How many reps did you get\?/);
});

test('the last set of an exercise names the next one, not rest', () => {
  const result = outcome('Done, 10 reps.', pushUps([{ weight: null, reps: 10 }, { weight: null, reps: 10 }, { weight: null, reps: 10 }]));
  assert.equal(result?.kind, 'logged');
  assert.match(result!.note, /set 4 of 4/);
  assert.match(result!.note, /moved on to Tricep Dip/);
  assert.doesNotMatch(result!.note, /rest has started/);
});

test('an implausible weight is held for confirmation, not logged', () => {
  const snapshot = buildLiveSessionSnapshot({
    target: { type: 'strength', planSessionId: 'p' },
    focus: 'Upper Push',
    exercises: [{ id: 'a', exerciseId: 'x', name: 'Dumbbell Bench Press', sets: 4, repScheme: '5-6', loadScheme: null }],
    currentExerciseIndex: 0,
    loggedSets: [[{ weight: 34, reps: 6 }]],
    resting: false,
    restTargetSec: 90,
    restEndAt: null,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 200,
  } as any);
  const result = outcome('Done, 5 pounds for 6 reps.', snapshot);
  assert.equal(result?.kind, 'weight_check');
  assert.match(result!.note, /NOTHING was logged/);
});

test('confirming a held weight logs the held set, denying it logs nothing', () => {
  const snapshot = buildLiveSessionSnapshot({
    target: { type: 'strength', planSessionId: 'p' },
    focus: 'Upper Push',
    exercises: [{ id: 'a', exerciseId: 'x', name: 'Dumbbell Bench Press', sets: 4, repScheme: '5-6', loadScheme: null }],
    currentExerciseIndex: 0,
    loggedSets: [[{ weight: 34, reps: 6 }]],
    resting: false,
    restTargetSec: 90,
    restEndAt: null,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 200,
  } as any);
  const recentUserMessages = [{ content: 'Done, 5 pounds for 6 reps.', at: new Date().toISOString() }];
  const yes = outcome('Yes, that was right.', snapshot, { recentUserMessages });
  assert.equal(yes?.kind, 'logged');
  assert.match(yes!.note, /set 2 of 4/);
  const no = outcome('No, it was 75.', snapshot, { recentUserMessages });
  assert.equal(no?.kind, 'needs_details');
  const later = outcome('Yes.', snapshot, {
    recentUserMessages: [{ content: 'Done, 5 pounds for 6 reps.', at: new Date(Date.now() - 10 * 60_000).toISOString() }],
  });
  assert.equal(later?.kind, 'not_logged');
});

test('asking to start during rest ends rest and logs nothing', () => {
  const result = outcome("Let's go.", pushUps([{ weight: null, reps: 10 }], { resting: true, restEndAt: Date.now() + 30_000 }));
  assert.equal(result?.kind, 'rest_ended');
  assert.match(result!.note, /set 2 of 4/);
});

test('an older app build is mirrored with the parser it actually runs', () => {
  assert.equal(outcome('I just did 10 push-ups.', pushUps(), { legacyClient: true })?.kind, 'not_logged');
  assert.equal(outcome('I got 10 reps.', pushUps(), { legacyClient: true })?.kind, 'logged');
  assert.equal(outcome('I just did 10 push-ups.', pushUps(), { legacyClient: false })?.kind, 'logged');
});

test('no live strength session means no note at all', () => {
  assert.equal(resolveTurnSetOutcome({ userText: 'I did 10', snapshot: null, units: 'imperial' }), null);
});

test('the typed-turn note is explicit that nothing was logged', () => {
  assert.match(describeTypedTurnSetOutcome(), /NOTHING was logged/);
});

const unlogged: ClaimGuardState = { liveSession: true, setLoggedThisTurn: false, restActive: false, actionSucceededThisTurn: false };
const logged: ClaimGuardState = { ...unlogged, setLoggedThisTurn: true, actionSucceededThisTurn: true };

test("Damion's exact false claims are all caught when nothing was logged", () => {
  for (const clause of [
    'Solid first set. ',
    'Rest is starting.',
    'Rest is running.',
    'Got it, you completed ten reps.',
    'The app should log that now.',
    "That's logged.",
    'Set one done, nice work.',
    'Rest starts now.',
  ]) {
    assert.equal(isUnbackedClaim(clause, unlogged), true, clause);
  }
});

test('the same lines are allowed when the set really was logged', () => {
  for (const clause of ['Solid first set.', 'Rest is starting.', 'Got it, you completed ten reps.']) {
    assert.equal(isUnbackedClaim(clause, logged), false, clause);
  }
});

test('rest talk is fine while rest is genuinely running', () => {
  assert.equal(isUnbackedClaim('Rest is running, almost up.', { ...unlogged, restActive: true }), false);
});

test('ordinary coaching is never touched', () => {
  for (const clause of [
    "Let's go, set one of Push-up, eight to twelve reps.",
    'Keep your core tight and elbows at forty-five degrees.',
    'How many reps did you get?',
    'Tell me when the set is done.',
    'Nice, set two is up next when rest ends.',
  ]) {
    assert.equal(isUnbackedClaim(clause, unlogged), false, clause);
  }
});

test('set and rest claims are left alone outside a live workout', () => {
  assert.equal(isUnbackedClaim('Solid first set yesterday.', { ...unlogged, liveSession: false }), false);
});

test("'Done, that session is cleared' with no tool call is dropped", () => {
  const { text, dropped } = guardClaims(
    "Done, that session is cleared. You're set to start your Upper Push workout tomorrow.",
    { ...unlogged, liveSession: false },
  );
  assert.equal(dropped.length, 1);
  assert.equal(text, "You're set to start your Upper Push workout tomorrow.");
});

test('an action claim stands when a tool really succeeded', () => {
  const { dropped } = guardClaims("I've swapped it to Dumbbell Bench Press.", { ...unlogged, actionSucceededThisTurn: true });
  assert.equal(dropped.length, 0);
});

test('tool results are read as success or failure by status', () => {
  assert.equal(isSuccessfulToolResult({ status: 'logged' }), true);
  assert.equal(isSuccessfulToolResult({ status: 'swapped' }), true);
  assert.equal(isSuccessfulToolResult({ status: 'no_session_today' }), false);
  assert.equal(isSuccessfulToolResult({ status: 'not_finished' }), false);
  assert.equal(isSuccessfulToolResult({ status: 'preview' }), false);
  assert.equal(isSuccessfulToolResult({ status: 'already_logged' }), false);
  assert.equal(isSuccessfulToolResult(null), false);
});

test('a resumed session start names the real next set, a fresh one says nothing extra', () => {
  const resumed = describeResumedStart(pushUps([{ weight: 34, reps: 10 }]), 'imperial');
  assert.match(resumed!, /RESUMED/);
  assert.match(resumed!, /set 2 of 4/);
  assert.match(resumed!, /at 75 lb/);
  assert.equal(describeResumedStart(pushUps(), 'imperial'), null);
  assert.equal(describeResumedStart(null, 'imperial'), null);
});

test("Hakeem's off-by-one: the set_logged cue names the set that was just logged, not the next one", () => {
  const twoDone = pushUps([{ weight: 34, reps: 10 }, { weight: 34, reps: 8 }], { resting: true, restEndAt: Date.now() + 60_000 });
  const logged = describeCueFacts('set_logged', twoDone, 'imperial');
  assert.match(logged!, /set just logged was set 2 of 4/);
  assert.match(logged!, /8 reps at 75 lb/);
  assert.match(logged!, /never set 3/);
  const restOver = describeCueFacts('rest_over', pushUps([{ weight: 34, reps: 10 }, { weight: 34, reps: 8 }]), 'imperial');
  assert.match(restOver!, /set coming up is set 3 of 4/);
  assert.equal(describeCueFacts('session_start', twoDone, 'imperial'), null);
  assert.equal(describeCueFacts(null, twoDone, 'imperial'), null);
});

const backSquat = (loggedSets: any[] = [], extra: Record<string, unknown> = {}) =>
  buildLiveSessionSnapshot({
    target: { type: 'strength', planSessionId: '7ec5e19b' },
    focus: 'Lower',
    exercises: [
      { id: 'a', exerciseId: 'x', name: 'Back Squat', sets: 4, repScheme: '6-8', loadScheme: 'working weight' },
      { id: 'b', exerciseId: 'y', name: 'Romanian Deadlift', sets: 3, repScheme: '8-10', loadScheme: null },
    ],
    currentExerciseIndex: 0,
    loggedSets: [loggedSets, []],
    resting: false,
    restTargetSec: 90,
    restEndAt: null,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 60,
    ...extra,
  } as any);

const holds = { holdsMissingWeight: true };

test("Hakeem's undo case: reps with no known weight on a loaded lift are held, never logged as bodyweight", () => {
  const result = outcome('I just did 10 reps.', backSquat(), holds);
  assert.equal(result?.kind, 'needs_weight');
  assert.match(result!.note, /NOTHING was logged yet/);
  assert.match(result!.note, /what weight that was/);
});

test('an older app build that still logs reps-only sets is mirrored as logged', () => {
  assert.equal(outcome('I just did 10 reps.', backSquat())?.kind, 'logged');
});

test('the weight they give next logs the held set', () => {
  const recentUserMessages = [{ content: 'I just did 10 reps.', at: new Date().toISOString() }];
  const spoken = outcome('Sixty pounds.', backSquat(), { ...holds, recentUserMessages });
  assert.equal(spoken?.kind, 'logged');
  assert.deepEqual(spoken?.set, { weight: 27.2, reps: 10 });
  const bare = outcome('60', backSquat(), { ...holds, recentUserMessages });
  assert.deepEqual(bare?.set, { weight: 27.2, reps: 10 });
  assert.match(bare!.note, /10 reps at 60 lb/);
});

test('bodyweight exercises are never asked for a weight', () => {
  const result = outcome('I just did 10 push-ups.', pushUps(), holds);
  assert.equal(result?.kind, 'logged');
  assert.deepEqual(result?.set, { weight: null, reps: 10 });
});

test('a weight already known for the exercise is carried instead of asking', () => {
  const afterSet = outcome('I just did 8 reps.', backSquat([{ weight: 27.2, reps: 10 }]), holds);
  assert.deepEqual(afterSet?.set, { weight: 27.2, reps: 8 });
  const stated = outcome('I just did 10 reps.', backSquat([], { statedWeight: { exerciseIndex: 0, weight: 27.2 } }), holds);
  assert.deepEqual(stated?.set, { weight: 27.2, reps: 10 });
});

test('a bare "at 60" is read as the weight in their units', () => {
  const result = outcome('I just did 10 reps at 60.', backSquat(), holds);
  assert.equal(result?.kind, 'logged');
  assert.deepEqual(result?.set, { weight: 27.2, reps: 10 });
});
