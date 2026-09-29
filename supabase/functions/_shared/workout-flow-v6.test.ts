import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amendSetFromServer, createHandlers } from './brain-handlers.ts';
import { claimFallback, guardClaims, isClearanceClaim, isFragment, INJURY_FALLBACK } from './claim-guard.ts';
import { buildLiveSessionSnapshot, describeEarlierExercises, describeLiveSessionSnapshot } from './live-session-format.ts';
import { resolveTurnSetOutcome as resolveOutcome } from './turn-set-outcome.ts';
import {
  describeCueFacts,
  describeTypedTurnSetOutcome,
  lastLoggedSetOf,
  missingRequiredAsk,
  resolveTurnSetOutcome,
} from './turn-set-outcome.ts';
import { resolveTurnText } from './system-cue.ts';

(globalThis as any).Deno ??= { env: { get: () => 'test-secret' } };

const T0 = Date.parse('2026-09-26T18:10:00Z');

const arms = (overrides: Record<string, unknown> = {}) => ({
  setParser: 6,
  startedAt: '2026-09-26T17:56:26.000Z',
  target: { type: 'strength', planSessionId: 'ef36ec7f' },
  focus: 'Arms',
  exercises: [
    { id: 'a', exerciseId: '81a2', name: 'Incline Dumbbell Curl', sets: 4, repScheme: '10', loadScheme: '40 lb each' },
    { id: 'b', exerciseId: '3e77', name: 'Cable Tricep Pushdown', sets: 4, repScheme: '12', loadScheme: '55 lb' },
    { id: 'c', exerciseId: '19b0', name: 'Hammer Curl', sets: 3, repScheme: '8-10', loadScheme: '40 lb each' },
  ],
  currentExerciseIndex: 0,
  loggedSets: [[{ weight: 18.1, reps: 8, at: T0 - 120_000, source: 'typed' }], [], []],
  resting: false,
  restTargetSec: 90,
  restEndAt: null,
  restPausedRemainingSec: null,
  ended: false,
  paused: false,
  elapsedSec: 600,
  statedWeight: null,
  restFinishedAt: T0 - 30_000,
  ...overrides,
});

const v6 = (userText: string, state: any = arms(), extra: Record<string, unknown> = {}) =>
  resolveTurnSetOutcome({
    userText,
    snapshot: buildLiveSessionSnapshot(state),
    units: 'imperial',
    holdsMissingWeight: true,
    appliesRestatementRule: true,
    confirmsBareReps: true,
    parserVersion: 6,
    clientVersion: 6,
    lastSet: lastLoggedSetOf(state),
    now: T0,
    ...extra,
  });

test('build 29 and older phones get exactly the old behaviour from the server', () => {
  const state = arms({ setParser: 5 });
  const old = (userText: string) =>
    resolveOutcome({
      userText,
      snapshot: buildLiveSessionSnapshot(state as any),
      units: 'imperial',
      holdsMissingWeight: true,
      appliesRestatementRule: true,
      confirmsBareReps: true,
      parserVersion: 5,
      clientVersion: 5,
      lastSet: lastLoggedSetOf(state),
      now: T0,
    });
  assert.equal(old('Eight reps.')?.kind, 'logged', 'v5 logs a bare count mid-set');
  assert.equal(
    old('I said forty pounds not thirty nine point nine.')?.kind,
    'logged',
    'a v5 phone logs this as 40 lb x 39 itself, so the server mirrors the card instead of contradicting it',
  );
  assert.equal(old('Done forty for eight.')?.kind, 'needs_details', 'the v5 parser cannot read "40 for 8" and asks');
  assert.equal(v6('Done forty for eight.')?.kind, 'logged', 'v6 reads it');
});

test("v6: Damion's weight correction changes the saved set and never adds one", () => {
  const outcome = v6('I said forty pounds not thirty nine point nine.');
  assert.equal(outcome?.kind, 'corrected');
  assert.deepEqual(outcome?.amend, { exerciseIndex: 0, setIndex: 0, weight: 18.1, reps: 8 });
  assert.match(outcome!.note, /CHANGED Incline Dumbbell Curl set 1 to 8 reps at 40 lb/);
  assert.match(outcome!.note, /Nothing new was logged/);
});

test('v6: a correction right after moving on fixes the last set of the previous exercise', () => {
  const state = arms({
    currentExerciseIndex: 1,
    loggedSets: [[8, 10, 8, 10].map((reps, i) => ({ weight: 18.1, reps, at: T0 - 300_000 + i * 60_000 })), [], []],
  });
  const outcome = v6('It was twelve reps not ten.', state);
  assert.deepEqual(outcome?.amend, { exerciseIndex: 0, setIndex: 3, weight: 18.1, reps: 12 });
});

test('v6: the card weight is the weight, so a reps-only report on the pushdowns logs 55 lb', () => {
  const state = arms({ currentExerciseIndex: 1, loggedSets: [[], [], []], restFinishedAt: null });
  const outcome = v6('Done, twelve reps.', state);
  assert.equal(outcome?.kind, 'logged');
  assert.deepEqual(outcome?.set, { weight: 24.9, reps: 12 });
  assert.match(outcome!.note, /12 reps at 55 lb/);
});

test('v6: a spoken count with no completion word is held and the coach must ask "Is that set done?"', () => {
  const outcome = v6('Eight reps at forty pounds.');
  assert.equal(outcome?.kind, 'needs_confirmation');
  assert.equal(outcome?.requiredAsk, 'Is that set done?');
  const yes = v6('Yes.', arms(), { recentUserMessages: [{ content: 'Eight reps at forty pounds.', at: new Date(T0 - 4_000).toISOString() }] });
  assert.equal(yes?.kind, 'logged');
  const again = v6('Done, ten.', arms(), { recentUserMessages: [{ content: 'Eight reps at forty pounds.', at: new Date(T0 - 4_000).toISOString() }] });
  assert.deepEqual(again?.set, { weight: 18.1, reps: 10 }, 'new numbers are a new report, never the held one');
});

test('"Rest" with nothing logged: no timer, and the coach asks for the reps', () => {
  for (const line of ['Rest.', 'And rest.', 'Start the rest timer']) {
    const outcome = v6(line);
    assert.equal(outcome?.kind, 'rest_request', line);
    assert.equal(outcome?.requiredAsk, 'How many reps did you get?');
  }
  const typedNote = describeTypedTurnSetOutcome(false, 'Rest');
  assert.match(typedNote, /did NOT start a rest timer/);
  assert.doesNotMatch(describeTypedTurnSetOutcome(true, 'Rest'), /did NOT start a rest timer/);
});

test('the coach can no longer say "Solid." or "Resting 90 seconds now." when nothing happened', () => {
  const state = { liveSession: true, setLoggedThisTurn: false, restActive: false, actionSucceededThisTurn: false, userReportedSet: true };
  assert.equal(guardClaims('Solid.', state).text, '');
  assert.equal(guardClaims('Resting 90 seconds now.', state).text, '');
  assert.equal(guardClaims("Adjusting it to 90 seconds now — check your screen, that's what's running.", state).text, '');
  assert.equal(guardClaims('Nice. How many reps did you get?', state).text, 'How many reps did you get?');
  assert.equal(guardClaims('Solid. Rest is starting.', { ...state, setLoggedThisTurn: true }).text, 'Solid. Rest is starting.');
  assert.equal(guardClaims('Try setting it to 45 degrees.', state).text, 'Try setting it to 45 degrees.');
});

test('the one question the app is waiting on is always asked', () => {
  assert.equal(missingRequiredAsk('Got it.', 'How many reps did you get?'), 'How many reps did you get?');
  assert.equal(missingRequiredAsk('How many reps did you get on that one?', 'How many reps did you get?'), null);
  assert.equal(missingRequiredAsk('Nice. Did you finish that set?', 'Is that set done?'), null);
  assert.equal(missingRequiredAsk('Okay.', 'Is that set done?'), 'Is that set done?');
  assert.equal(missingRequiredAsk('anything', null), null);
});

test('adjust_rest_timer cannot extend, skip or pause a rest that is not running', async () => {
  const state = arms();
  const supabase = {
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { state, updated_at: new Date().toISOString() }, error: null }),
        insert: () => {
          throw new Error('no app action should be written');
        },
      };
      return q;
    },
  };
  const handlers = createHandlers(supabase, 'u', null, { currentUserText: 'extend my rest' });
  for (const action of ['extend', 'skip', 'pause', 'resume']) {
    const result = await handlers.adjust_rest_timer({ action, seconds: 30 });
    assert.equal(result.status, 'not_resting', action);
  }
});

test('with the workout screen closed, the server sends the correction to the app and waits for it to land', async () => {
  const state: any = arms();
  const actions: any[] = [];
  const supabase = {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { state, updated_at: new Date().toISOString() }, error: null }),
        insert: async (row: any) => {
          actions.push(row);
          if (table === 'app_action' && row.type === 'amend_set') {
            const { exercise_index, set_index, weight_kg, reps } = row.payload;
            state.loggedSets[exercise_index][set_index] = { ...state.loggedSets[exercise_index][set_index], weight: weight_kg, reps };
          }
          return { error: null };
        },
      };
      return q;
    },
  };
  const landed = await amendSetFromServer(supabase, 'u', { exerciseIndex: 0, setIndex: 0, weight: 18.1, reps: 10 });
  assert.equal(landed, true);
  assert.deepEqual(actions[0].payload, { exercise_index: 0, set_index: 0, weight_kg: 18.1, reps: 10 });
});

test('moving to the next exercise: new phones get a rest and a setup cue, old phones keep the old wording', () => {
  const lastCurl = arms({
    loggedSets: [[8, 10, 8].map((reps, i) => ({ weight: 18.1, reps, at: T0 - 300_000 + i * 90_000 })), [], []],
  });
  const outcome = v6('Done, ten reps.', lastCurl);
  assert.match(outcome!.note, /started a rest timer before it/);
  const old = v6('Done, ten reps.', lastCurl, { parserVersion: 5, clientVersion: 5 });
  assert.match(old!.note, /There is no rest timer between exercises/);
  assert.match(resolveTurnText('[[SYSTEM_CUE]] exercise_advanced_rest'), /A rest timer is running on screen before it starts/);
  const pushdowns = buildLiveSessionSnapshot(
    arms({ currentExerciseIndex: 1, loggedSets: [[8, 10, 8, 10].map((reps) => ({ weight: 18.1, reps })), [], []], resting: true, restEndAt: Date.now() + 60_000 }) as any,
  );
  assert.match(describeCueFacts('exercise_advanced_rest', pushdowns, 'imperial')!, /Cable Tricep Pushdown.*set 1 of 4, target 12 at 55 lb/);
});

test('the coach cannot skip ahead to the wrong exercise on a transition (simulator run, 28 Sep)', async () => {
  const { exerciseMentionContext, mentionsCurrentExercise } = await import('./exercise-mention-guard.ts');
  const { describeExpectedExerciseLine } = await import('./turn-set-outcome.ts');
  const state = arms({
    currentExerciseIndex: 1,
    loggedSets: [[8, 10, 8, 10].map((reps, i) => ({ weight: 18.1, reps, at: T0 - 300_000 + i * 60_000 })), [], []],
    resting: true,
    restEndAt: Date.now() + 80_000,
  });
  const ctx = exerciseMentionContext(state);
  const reply =
    'Incline Dumbbell Curl is done. Hammer Curl next — 3 sets of 8 to 10 reps at 40 pounds each. Get your grip set and go when the rest ends.';
  const guarded = guardClaims(reply, {
    liveSession: true,
    setLoggedThisTurn: true,
    restActive: true,
    actionSucceededThisTurn: false,
    exerciseMentions: ctx,
  });
  assert.deepEqual(guarded.dropped, ['Hammer Curl next — 3 sets of 8 to 10 reps at 40 pounds each.']);
  assert.equal(mentionsCurrentExercise(guarded.text, ctx!), false);
  assert.equal(
    describeExpectedExerciseLine('exercise_advanced_rest', buildLiveSessionSnapshot(state as any), 'imperial'),
    'Next up: Cable Tricep Pushdown, 4 sets of 12 at 55 lb. Go when the rest ends.',
  );
  const right = 'Curls are done. Cable Tricep Pushdown next, 4 sets of 12 at 55 pounds, elbows pinned.';
  assert.deepEqual(guardClaims(right, { liveSession: true, setLoggedThisTurn: true, restActive: true, actionSucceededThisTurn: false, exerciseMentions: ctx }).dropped, []);
  assert.equal(mentionsCurrentExercise('Pushdowns next, elbows pinned.', ctx!), true);
  assert.equal(mentionsCurrentExercise('Incline Dumbbell Curl is done.', ctx!), false);
});

test('after an exercise is finished, the coach still sees what was saved for it, corrections included', () => {
  const snapshot = buildLiveSessionSnapshot({
    target: { type: 'strength', planSessionId: 'p' },
    focus: 'arms',
    exercises: [
      { id: 'a', exerciseId: 'x1', name: 'Incline Dumbbell Curl', sets: 4, repScheme: '10', loadScheme: '40 lb each' },
      { id: 'b', exerciseId: 'x2', name: 'Cable Tricep Pushdown', sets: 4, repScheme: '12', loadScheme: '55 lb' },
    ],
    currentExerciseIndex: 1,
    loggedSets: [
      [
        { weight: 18.1, reps: 9, at: T0 },
        { weight: 20.4, reps: 8, at: T0 + 90_000 },
        { weight: 20.4, reps: 10, at: T0 + 180_000 },
        { weight: 20.4, reps: 9, at: T0 + 270_000 },
      ],
      [],
    ],
    resting: true,
    restTargetSec: 60,
    restEndAt: Date.now() + 30_000,
    restPausedRemainingSec: null,
    ended: false,
    paused: false,
    elapsedSec: 400,
    restOverrideSec: 60,
  } as any);
  const line = describeEarlierExercises(snapshot, 'imperial')!;
  assert.match(line, /Already done in this session, as saved \(corrections included\): Incline Dumbbell Curl, 4 of 4 sets: 40 lb×9, 45 lb×8, 45 lb×10, 45 lb×9\./);
  assert.match(line, /Never work sets out of those messages/);
  assert.match(describeLiveSessionSnapshot(snapshot!, 'imperial'), /Already done in this session/);
  const fresh = buildLiveSessionSnapshot({ ...(snapshot as any), target: { type: 'strength', planSessionId: 'p' }, exercises: [], currentExerciseIndex: 0, loggedSets: [], resting: false, restTargetSec: 90, restEndAt: null, restPausedRemainingSec: null, ended: false, paused: false, elapsedSec: 0, focus: null } as any);
  assert.equal(describeEarlierExercises(fresh, 'imperial'), null, 'no session content, no line');
});

test('a message about an earlier workout is answered, never met with a rep-count question', () => {
  const note = describeTypedTurnSetOutcome(true, 'last week I did 12 at 50 on these');
  assert.match(note, /about an earlier workout or day/);
  assert.doesNotMatch(note, /How many reps did you get/);
  assert.match(describeTypedTurnSetOutcome(true, 'my elbow feels weird'), /How many reps did you get/);
});

test('when the guard strips a reply down to a scrap, the proper fallback is used instead', () => {
  const state = { liveSession: true, setLoggedThisTurn: false, restActive: true, actionSucceededThisTurn: false, injuryOnFile: true };
  const { text, dropped } = guardClaims("55 is fine for these. Go ahead.", state);
  assert.equal(dropped.length, 1);
  assert.equal(text, 'Go ahead.');
  assert.ok(isFragment(text));
  assert.equal((isFragment(text) ? '' : text) || claimFallback(true, false, true, dropped.some(isClearanceClaim)), INJURY_FALLBACK);
  assert.equal(claimFallback(true, false, true, false), "Tell me when the set's done and how many reps you got.");
  assert.equal(isFragment('Rest is running, take your time.'), false);
});

test('discarding after an app kill also deletes the saved partial workout, not just the screen state', async () => {
  let live: any = { ...arms(), workoutLogId: 'log-1', loggedSets: [[{ weight: 102.1, reps: 5, at: T0 }], [], []] };
  const deleted: string[] = [];
  const supabase = {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: any = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return q;
        },
        maybeSingle: async () =>
          table === 'live_session_state' && live
            ? { data: { state: live, updated_at: new Date().toISOString() }, error: null }
            : { data: null, error: null },
        insert: async (row: any) => {
          if (table === 'app_action' && row.type === 'discard_workout') live = null;
          return { error: null };
        },
        delete: () => {
          const d: any = {
            eq: (column: string, value: unknown) => {
              filters[column] = value;
              return d;
            },
            then: (resolve: (v: unknown) => void) => {
              deleted.push(`${table}:${filters.id ?? filters.user_id}`);
              resolve({ error: null });
            },
          };
          return d;
        },
      };
      return q;
    },
  };
  const handlers = createHandlers(supabase, 'u', null, {});
  const preview = await handlers.discard_workout({});
  assert.equal(preview.status, 'preview');
  assert.equal(preview.sets_that_would_be_deleted, 1);
  const result = await handlers.discard_workout({ confirm: true, confirm_token: preview.confirm_token });
  assert.equal(result.status, 'discarded');
  assert.deepEqual(deleted, ['workout_log:log-1'], 'the app cleared its screen state, the server removed the saved row');
});
