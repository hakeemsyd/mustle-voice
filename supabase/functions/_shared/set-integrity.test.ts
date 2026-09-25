import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandlers, logSetFromServer, resolveDispute, undoLockFor } from './brain-handlers.ts';
import { BRAIN_TOOLS, VOICE_TOOLS } from './brain-tools.ts';
import { classifySpokenSet } from './set-report.ts';
import { detectSetCountDispute, describeDisputeOutcome, findLikelyDuplicate } from './set-dispute.ts';
import { resolveTurnSetOutcome, TURN_NOTE_HEADER } from './turn-set-outcome.ts';
import { buildLiveSessionSnapshot, describeLiveSessionSnapshot } from './live-session-format.ts';
import { guardClaims } from './claim-guard.ts';
import { kgToLb } from './weight-units.ts';
import { finalizeStaleLiveSession } from './interrupted-session.ts';

(globalThis as any).Deno ??= { env: { get: () => 'test-secret' } };

const T0 = Date.parse('2026-09-24T23:43:28.806Z');

const shoulders = (rearDeltSets: any[], currentExerciseIndex = 2, frontRaiseSets: any[] = []) => ({
  setParser: 3,
  startedAt: '2026-09-24T23:42:54.029Z',
  target: { type: 'strength', planSessionId: 'd103abb0' },
  focus: 'Shoulders',
  exercises: [
    { id: 'a', exerciseId: 'ca56', name: 'Dumbbell Shoulder Press', sets: 4, repScheme: '10', loadScheme: '45 lb each' },
    { id: 'b', exerciseId: 'f96c', name: 'Lateral Raise', sets: 4, repScheme: '10', loadScheme: '30 lb each' },
    { id: 'c', exerciseId: '3908', name: 'Rear Delt Fly', sets: 3, repScheme: '10', loadScheme: '25 lb each' },
    { id: 'd', exerciseId: '0be0', name: 'Front Raise', sets: 3, repScheme: '10', loadScheme: '20 lb each' },
  ],
  currentExerciseIndex,
  loggedSets: [
    [10, 10, 8, 7].map((reps) => ({ weight: null, reps })),
    [10, 10, 10, 10].map((reps) => ({ weight: null, reps })),
    rearDeltSets,
    frontRaiseSets,
  ],
  resting: true,
  restTargetSec: 90,
  restEndAt: T0 + 90_000,
  restPausedRemainingSec: null,
  ended: false,
  paused: false,
  elapsedSec: 1175,
  statedWeight: null,
});

const coachSet = { weight: 11.3, reps: 10, at: T0, source: 'coach' };
const phoneSet = { weight: 11.3, reps: 10, at: T0 + 2_300, source: 'voice' };
const doubleLogged = () => shoulders([coachSet, phoneSet]);

const fakeSupabase = (initialState: any, liveUpdatedAt?: string, messages: { content: string; at: string }[] = []) => {
  const state = structuredClone(initialState);
  const actions: { type: string; payload: any }[] = [];
  const updates: { table: string; values: any; id?: string }[] = [];
  const inserts: { table: string; row: any }[] = [];
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let pendingUpdate: any = null;
    const query: any = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return query;
      },
      in: () => query,
      gte: () => query,
      order: () => query,
      limit: () => query,
      delete: () => query,
      update: (values: any) => {
        pendingUpdate = values;
        return query;
      },
      maybeSingle: async () => {
        if (pendingUpdate) {
          updates.push({ table, values: pendingUpdate, id: filters.id as string });
          return { data: { id: filters.id }, error: null };
        }
        if (table === 'live_session_state') {
          return { data: { state, updated_at: liveUpdatedAt ?? new Date().toISOString() }, error: null };
        }
        return { data: null, error: null };
      },
      insert: (row: any) => {
        inserts.push({ table, row });
        if (table === 'app_action') {
          actions.push({ type: row.type, payload: row.payload });
          const current = state.loggedSets[state.currentExerciseIndex];
          if (row.type === 'log_set') current.push({ weight: row.payload.weight_kg, reps: row.payload.reps });
          if (row.type === 'undo_last_set') current.pop();
        }
        const result = { error: null, data: { id: 'new-row' } };
        return { ...result, select: () => ({ maybeSingle: async () => result }), then: (done: any) => done(result) };
      },
      then: (done: any) => done({ data: table === 'message' ? messages : [], error: null }),
    };
    return query;
  };
  return { client: { from }, state, actions, updates, inserts };
};

test("Damion's 'Ten reps.' on a fresh Rear Delt Fly: the app holds it for a weight", () => {
  const outcome = resolveTurnSetOutcome({
    userText: 'Ten reps.',
    snapshot: buildLiveSessionSnapshot(shoulders([]) as any),
    units: 'imperial',
    lastCoachMessage: { content: 'How many reps did you get?', at: '2026-09-24T23:43:21.731Z' },
    holdsMissingWeight: true,
    now: Date.parse('2026-09-24T23:43:26.528Z'),
  });
  assert.equal(outcome?.kind, 'needs_weight');
  assert.match(outcome!.note, /never assume the plan's weight/);
});

test('the coach has no tool that writes a set; only the app logs', () => {
  const names = (tools: readonly { name: string }[]) => tools.map((tool) => tool.name);
  assert.equal(names(BRAIN_TOOLS).includes('log_live_set'), false);
  assert.equal(names(VOICE_TOOLS).includes('log_live_set'), false);
  const handlers = createHandlers(fakeSupabase(shoulders([])).client, 'u', null, { currentUserText: 'Ten reps.' });
  assert.equal('log_live_set' in handlers, false);
});

test("his correction is never read as a finished set, by the phone or the server", () => {
  const line = "I haven't done set two yet, and I'm on the rest. It's saying next is set three. Could you please fix that?";
  for (const typed of [false, true]) {
    const intent = classifySpokenSet(line, 'imperial', { awaitingDetails: false, typed });
    assert.equal(intent.kind, 'ignore', `typed=${typed}`);
  }
  assert.equal(classifySpokenSet("I'm not done yet", 'imperial', { awaitingDetails: false }).kind, 'ignore');
  assert.equal(classifySpokenSet('Done.', 'imperial', { awaitingDetails: false }).kind, 'needs_details');
  const outcome = resolveTurnSetOutcome({
    userText: line,
    snapshot: buildLiveSessionSnapshot(shoulders([coachSet]) as any),
    units: 'imperial',
    holdsMissingWeight: true,
    appliesRestatementRule: true,
  });
  assert.equal(outcome?.kind, 'not_logged');
  assert.match(outcome!.note, /You cannot log sets yourself/);
});

test('repeating the set just logged is a restatement, not a second set', () => {
  const justLogged = buildLiveSessionSnapshot(shoulders([coachSet]) as any);
  const said = (userText: string, extra: Record<string, unknown> = {}) =>
    resolveTurnSetOutcome({ userText, snapshot: justLogged, units: 'imperial', holdsMissingWeight: true, appliesRestatementRule: true, ...extra });
  assert.equal(said('Yeah, done, ten reps.', { now: T0 + 5_000 })?.kind, 'repeat');
  assert.equal(said('Done, ten reps.', { now: T0 + 90_000 })?.kind, 'logged');
  assert.equal(said('Done, ten reps.', { now: T0 + 5_000, appliesRestatementRule: false })?.kind, 'logged');
  assert.equal(said('10 reps', { now: T0 + 5_000, typed: true })?.kind, 'logged');
});

test('mid-set, a bare "Eight reps." is a finished set and logs; the coach never asks for the reps again', () => {
  const training = buildLiveSessionSnapshot({
    ...shoulders([]),
    resting: false,
    restEndAt: null,
    statedWeight: { exerciseIndex: 2, weight: 11.3 },
  } as any);
  assert.equal(classifySpokenSet('Eight reps.', 'imperial', { awaitingDetails: false, confirmsBareReps: true }).kind, 'log');
  const outcome = resolveTurnSetOutcome({
    userText: 'Eight reps.',
    snapshot: training,
    units: 'imperial',
    holdsMissingWeight: true,
    appliesRestatementRule: true,
    confirmsBareReps: true,
  });
  assert.equal(outcome?.kind, 'logged');
  assert.deepEqual(outcome?.set, { weight: 11.3, reps: 8 });
});

test('during rest a bare rep count is held, the coach asks "Is that set done?", and yes logs it while no drops it', () => {
  const resting = buildLiveSessionSnapshot(shoulders([{ ...coachSet, at: T0 - 120_000 }]) as any);
  const base = { snapshot: resting, units: 'imperial' as const, holdsMissingWeight: true, appliesRestatementRule: true, confirmsBareReps: true, now: T0 };
  const held = resolveTurnSetOutcome({ ...base, userText: 'Eight reps, same weight.' });
  assert.equal(held?.kind, 'needs_confirmation');
  assert.match(held!.note, /Ask exactly "Is that another set done\?"/);
  const earlier = [{ content: 'Eight reps, same weight.', at: new Date(T0 - 5_000).toISOString() }];
  const yes = resolveTurnSetOutcome({ ...base, userText: 'Yeah.', recentUserMessages: earlier });
  assert.equal(yes?.kind, 'logged');
  assert.deepEqual(yes?.set, { weight: 11.3, reps: 8 });
  const no = resolveTurnSetOutcome({ ...base, userText: "No, that's for the next set.", recentUserMessages: earlier });
  assert.equal(no?.kind, 'not_logged');
});

test('while the rest card is up, no spoken report counts another set until they confirm it', () => {
  const resting = buildLiveSessionSnapshot(shoulders([{ ...coachSet, at: T0 - 60_000 }]) as any);
  const base = { snapshot: resting, units: 'imperial' as const, holdsMissingWeight: true, appliesRestatementRule: true, confirmsBareReps: true, now: T0 };
  for (const line of ['That was eight reps at 25 pounds.', 'Done, eight reps.', 'I did eight.']) {
    assert.equal(resolveTurnSetOutcome({ ...base, userText: line })?.kind, 'needs_confirmation', line);
  }
  const earlier = [{ content: 'Done, eight reps.', at: new Date(T0 - 4_000).toISOString() }];
  assert.equal(resolveTurnSetOutcome({ ...base, userText: 'Yes.', recentUserMessages: earlier })?.kind, 'logged');
  const afterStart = [{ content: "Let's go.", at: new Date(T0 - 2_000).toISOString() }, ...earlier];
  assert.notEqual(resolveTurnSetOutcome({ ...base, userText: 'Yes.', recentUserMessages: afterStart })?.kind, 'logged');
  const newNumbers = resolveTurnSetOutcome({ ...base, userText: 'Yeah, done, ten reps.', recentUserMessages: earlier });
  assert.notDeepEqual(newNumbers?.set, { weight: 11.3, reps: 8 });
  assert.equal(classifySpokenSet('8 reps', 'imperial', { awaitingDetails: false, confirmsBareReps: true, resting: true, typed: true }).kind, 'log');
  assert.equal(classifySpokenSet('Eight.', 'imperial', { awaitingDetails: true, confirmsBareReps: true, resting: true }).kind, 'log');
  const training = buildLiveSessionSnapshot({ ...shoulders([{ ...coachSet, at: T0 - 60_000 }]), resting: false, restEndAt: null } as any);
  assert.equal(resolveTurnSetOutcome({ ...base, snapshot: training, userText: 'Done, eight reps.' })?.kind, 'logged');
});

test('an older build that cannot hold bare reps gets a question that still works with it', () => {
  const resting = buildLiveSessionSnapshot(shoulders([{ ...coachSet, at: T0 - 120_000 }]) as any);
  const outcome = resolveTurnSetOutcome({ userText: 'Eight reps.', snapshot: resting, units: 'imperial', holdsMissingWeight: true, now: T0 });
  assert.equal(outcome?.kind, 'not_logged');
  assert.match(outcome!.note, /Is that set done\? How many was that\?/);
  assert.doesNotMatch(outcome!.note, /How many reps did you get/);
});

test('after "Let\'s go" ends the rest, the next report is a new set even seconds later', () => {
  const afterStart = buildLiveSessionSnapshot({
    ...shoulders([coachSet]),
    resting: false,
    restEndAt: null,
    restFinishedAt: T0 + 10_000,
  } as any);
  const base = { snapshot: afterStart, units: 'imperial' as const, holdsMissingWeight: true, appliesRestatementRule: true, confirmsBareReps: true };
  assert.equal(resolveTurnSetOutcome({ ...base, userText: 'Done eight reps.', now: T0 + 17_000 })?.kind, 'logged');
  const stillResting = buildLiveSessionSnapshot(shoulders([coachSet]) as any);
  assert.equal(
    resolveTurnSetOutcome({ ...base, snapshot: stillResting, userText: 'Done eight reps.', now: T0 + 7_000 })?.kind,
    'repeat',
  );
});

test('when the workout screen is closed, the server logs the set exactly as the app would', async () => {
  const db = fakeSupabase(shoulders([]));
  const landed = await logSetFromServer(db.client, 'u', { weight: 11.3, reps: 10 }, 'I did 10 at 25 pounds');
  assert.equal(landed, true);
  assert.deepEqual(db.actions, [
    { type: 'log_set', payload: { reps: 10, weight_kg: 11.3, unit: null, source_text: 'I did 10 at 25 pounds' } },
  ]);
});

test("Damion's two corrections are read as one extra set on Rear Delt Fly", () => {
  for (const line of [
    "I haven't done set two yet, and I'm on the rest. It's saying next is set three. Could you please fix that?",
    'No, it should be set two coming next. It says set three.',
  ]) {
    const dispute = detectSetCountDispute(line, doubleLogged());
    assert.equal(dispute?.exerciseName, 'Rear Delt Fly', line);
    assert.equal(dispute?.done, 2);
    assert.equal(dispute?.targetDone, 1);
    assert.equal(dispute?.autoUndo, true);
  }
});

test("his corrections never read as a set report, so neither the phone nor the coach logs one from them", () => {
  const snapshot = buildLiveSessionSnapshot(doubleLogged() as any);
  for (const line of [
    "I haven't done set two yet, and I'm on the rest. It's saying next is set three. Could you please fix that?",
    'No, it should be set two coming next. It says set three.',
    'Thank you. It says that my next set is set three. How do I do the next set?',
    'It logged that twice.',
    'I only did one set',
  ]) {
    const outcome = resolveTurnSetOutcome({ userText: line, snapshot, units: 'imperial', holdsMissingWeight: true });
    assert.notEqual(outcome?.kind, 'logged', line);
    assert.notEqual(outcome?.kind, 'needs_weight', line);
  }
});

test('once the extra set is gone the same correction is confirmed, never a second removal', () => {
  const fixed = shoulders([coachSet]);
  for (const line of [
    "I haven't done set two yet, and I'm on the rest. It's saying next is set three.",
    'No, it should be set two coming next.',
  ]) {
    const claim = detectSetCountDispute(line, fixed);
    assert.equal(claim?.matches, true, line);
    assert.equal(claim?.autoUndo, false, line);
    assert.equal(claim?.targetDone, 1, line);
  }
});

test("Hakeem's repeat: saying it again when the count is already right removes nothing, and the coach cannot undo", async () => {
  const line = "I haven't done set two yet, and I'm on rest. It's saying next is set three. Could you please fix that?";
  const db = fakeSupabase(shoulders([coachSet]));
  const claim = detectSetCountDispute(line, db.state)!;
  const resolution = await resolveDispute(db.client, 'u', claim);
  assert.equal(resolution, 'confirmed');
  const note = describeDisputeOutcome(claim, resolution, TURN_NOTE_HEADER);
  assert.match(note, /the next set is set 2 of 3/);
  assert.match(note, /Do not call undo_last_set/);
  const handlers = createHandlers(db.client, 'u', null, { currentUserText: line, undoLock: undoLockFor(resolution) });
  assert.equal((await handlers.undo_last_set({})).status, 'not_needed');
  assert.deepEqual(db.actions, []);
  assert.equal(db.state.loggedSets[2].length, 1);
});

test('reading the screen back, asking a question, or stating a true count never removes a set', () => {
  const state = doubleLogged();
  assert.equal(detectSetCountDispute('Thank you. It says that my next set is set three. How do I do the next set?', state), null);
  assert.equal(detectSetCountDispute('Did I not do set two?', state), null);
  assert.equal(detectSetCountDispute('Ten reps.', state), null);
  for (const line of ["I haven't done set three yet", "I'm on set three"]) {
    const claim = detectSetCountDispute(line, state);
    assert.equal(claim?.matches, true, line);
    assert.equal(claim?.autoUndo, false, line);
  }
});

test('"it logged that twice" only fixes itself when the last two sets really look like one set counted twice', () => {
  const withEvidence = detectSetCountDispute('It logged that twice.', doubleLogged());
  assert.equal(withEvidence?.targetDone, 1);
  assert.equal(withEvidence?.autoUndo, true);
  const noTimes = shoulders([{ weight: 11.3, reps: 10 }, { weight: 11.3, reps: 10 }]);
  assert.equal(detectSetCountDispute('It logged that twice.', noTimes)?.autoUndo, false);
  const minutesApart = shoulders([coachSet, { ...phoneSet, at: T0 + 150_000 }]);
  assert.equal(detectSetCountDispute('You counted it twice', minutesApart)?.autoUndo, false);
});

test('"I only did one set" sets the count directly, and more than one extra set is never removed without asking', () => {
  assert.equal(detectSetCountDispute('I only did one set', doubleLogged())?.targetDone, 1);
  const three = shoulders([coachSet, phoneSet, { ...phoneSet, at: T0 + 4_000 }]);
  const dispute = detectSetCountDispute("I haven't done set two", three);
  assert.equal(dispute?.targetDone, 1);
  assert.equal(dispute?.autoUndo, false);
  assert.match(describeDisputeOutcome(dispute!, 'manual', TURN_NOTE_HEADER), /confirm with them first that 2 sets/);
});

test('a phantom set that finished the exercise is only corrected when they name that exercise', () => {
  const advanced = shoulders([coachSet, phoneSet, { ...phoneSet, at: T0 + 200_000 }], 3);
  assert.equal(detectSetCountDispute("I haven't done set three of rear delt fly yet", advanced)?.exerciseName, 'Rear Delt Fly');
  assert.equal(detectSetCountDispute("I haven't done set three yet", advanced), null);
});

test('the correction removes exactly one set and reports it fixed', async () => {
  const db = fakeSupabase(doubleLogged());
  const dispute = detectSetCountDispute('No, it should be set two coming next.', db.state)!;
  const resolution = await resolveDispute(db.client, 'damion', dispute);
  assert.equal(resolution, 'undone');
  assert.deepEqual(db.actions.map((a) => a.type), ['undo_last_set']);
  assert.equal(db.state.loggedSets[2].length, 1);
  const note = describeDisputeOutcome(dispute, resolution, TURN_NOTE_HEADER);
  assert.match(note, /now has 1 of 3 sets done and the next set is set 2 of 3/);
  assert.match(note, /Never ask them what their screen/);
});

test('after the app removes the extra set, the coach cannot remove a second one in the same turn', async () => {
  const db = fakeSupabase(doubleLogged());
  const dispute = detectSetCountDispute("I haven't done set two yet. It's saying next is set three.", db.state)!;
  const resolution = await resolveDispute(db.client, 'u', dispute);
  const handlers = createHandlers(db.client, 'u', null, {
    currentUserText: "I haven't done set two yet. It's saying next is set three.",
    undoLock: undoLockFor(resolution),
  });
  assert.equal((await handlers.undo_last_set({})).status, 'already_undone');
  assert.equal(db.actions.filter((a) => a.type === 'undo_last_set').length, 1);
  assert.equal(db.state.loggedSets[2].length, 1);
});

test('the coach sees how each set was logged, and two identical sets seconds apart are flagged', () => {
  assert.deepEqual(findLikelyDuplicate([coachSet, phoneSet] as any), { first: 1, second: 2, gapSec: 2 });
  const block = describeLiveSessionSnapshot(buildLiveSessionSnapshot(doubleLogged() as any)!, 'imperial');
  assert.match(block, /set 1: 25 lb×10 \(logged from what they said in chat\)/);
  assert.match(block, /set 2: 25 lb×10 \(logged from what they said, 2s after set 1\)/);
  assert.match(block, /WARNING: sets 1 and 2 on this exercise are identical/);
  assert.match(block, /believe them over this block and call undo_last_set/);
});

test("the coach's request to read the screen back is dropped during a workout", () => {
  const state = { liveSession: true, setLoggedThisTurn: false, restActive: true, actionSucceededThisTurn: false };
  const damion =
    "I need to see what's actually on your screen right now, can you tell me what the set counter shows at the top of the exercise card?";
  assert.equal(guardClaims(damion, state).text, '');
  assert.equal(guardClaims('What does your screen show?', state).text, '');
  assert.equal(guardClaims('Check the card, it should show set two now.', state).text, 'Check the card, it should show set two now.');
  assert.equal(guardClaims("What's on the card today is Rear Delt Fly.", state).text, "What's on the card today is Rear Delt Fly.");
});

test('a 25 lb set stored as 11.3 kg reads back as 25 lb, not 24.9', () => {
  assert.equal(kgToLb(11.3), 25);
  assert.equal(kgToLb(27.2), 60);
  assert.equal(kgToLb(61.2), 135);
  assert.equal(kgToLb(80), 176.4);
});

test('an abandoned workout updates its own record instead of adding a second copy', async () => {
  const db = fakeSupabase({ ...shoulders([coachSet]), workoutLogId: 'a2d8fc86' }, '2026-09-24T23:44:46Z');
  const result = await finalizeStaleLiveSession(db.client, 'damion', 60 * 60 * 1000);
  assert.deepEqual(result, { finalized: true, workoutLogId: 'a2d8fc86' });
  assert.equal(db.updates[0].table, 'workout_log');
  assert.equal(db.updates[0].values.status, 'interrupted');
  assert.equal(db.inserts.filter((i) => i.table === 'workout_log').length, 0);
});
