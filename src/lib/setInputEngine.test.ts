import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeUndoRequest, looksLikeMisheardUndo } from '../../supabase/functions/_shared/set-report.ts';
import {
  decideConfirmTap,
  decideSetInput,
  describeNextSetLine,
  describeUndo,
  NO_HOLDS,
  type EngineEffect,
  type EngineExercise,
  type EngineHolds,
  type EngineLoggedSet,
  type EngineSource,
  type EngineState,
} from './setInputEngine.ts';
import { kgToDisplayWeight, type Units } from './units.ts';
import { customRestFor, restKeyOf } from '../../supabase/functions/_shared/rest-length.ts';

const ARMS: EngineExercise[] = [
  { name: 'Incline Dumbbell Curl', sets: 4, repScheme: '10', loadScheme: '40 lb each' },
  { name: 'Cable Tricep Pushdown', sets: 4, repScheme: '12', loadScheme: '55 lb' },
  { name: 'Hammer Curl', sets: 3, repScheme: '8-10', loadScheme: '40 lb each' },
  { name: 'Zone 2 Cardio', sets: 1, repScheme: '25 minutes', loadScheme: null },
];

const DEFAULT_REST = 105;

class Workout {
  exercises: EngineExercise[];
  index = 0;
  sets: EngineLoggedSet[][];
  resting = false;
  restEndAt: number | null = null;
  restTarget: number | null = null;
  restFinishedAt: number | null = null;
  restOverride: number | null = null;
  restByExercise: Record<string, number> = {};
  saved: Record<string, number> = {};
  stated: { exerciseIndex: number; weight: number; at: number } | null = null;
  lastTyped: { text: string; at: number } | null = null;
  ended = false;
  holds: EngineHolds = NO_HOLDS;
  lines: string[] = [];
  toCoach: string[] = [];
  coachLine: string | null = null;
  draft = '';
  now: number;
  restsStarted: number[] = [];
  units: Units;

  constructor(exercises: EngineExercise[], start: string, units: Units = 'imperial') {
    this.exercises = exercises;
    this.sets = exercises.map(() => []);
    this.now = Date.parse(start);
    this.units = units;
  }

  wait(seconds: number) {
    return this.at(new Date(this.now + seconds * 1000).toISOString());
  }

  at(time: string) {
    const next = Date.parse(time);
    assert.ok(next >= this.now, `time went backwards: ${time}`);
    this.now = next;
    if (this.resting && this.restEndAt !== null && this.now >= this.restEndAt) {
      this.resting = false;
      this.restFinishedAt = this.restEndAt;
      this.restEndAt = null;
    }
    return this;
  }

  state(): EngineState {
    return {
      exercises: this.exercises,
      currentExerciseIndex: this.index,
      loggedSets: this.sets,
      resting: this.resting,
      restRemainingSec: this.restEndAt !== null ? Math.max(0, Math.round((this.restEndAt - this.now) / 1000)) : null,
      restFinishedAt: this.restFinishedAt,
      statedWeight: this.stated,
      units: this.units,
      lastCoachLine: this.coachLine,
      lastTypedLog: this.lastTyped,
      now: this.now,
    };
  }

  restOver() {
    this.resting = false;
    this.restEndAt = null;
    this.restFinishedAt = this.now;
    return this;
  }

  restFor(index: number) {
    return customRestFor(this.exercises[index], {
      restByExercise: this.restByExercise,
      restOverrideSec: this.restOverride,
      savedRestByExercise: this.saved,
    })?.seconds ?? null;
  }

  private startRest() {
    const seconds = this.restFor(this.index) ?? DEFAULT_REST;
    this.resting = true;
    this.restTarget = seconds;
    this.restEndAt = this.now + seconds * 1000;
    this.restsStarted.push(seconds);
  }

  private apply(effects: EngineEffect[]) {
    for (const effect of effects) {
      switch (effect.type) {
        case 'log': {
          const exercise = this.exercises[this.index];
          this.sets[this.index] = [...this.sets[this.index], { weight: effect.weight, reps: effect.reps, unit: effect.unit, at: this.now }];
          const summary =
            effect.weight === null ? `${effect.reps} reps · bodyweight` : `${kgToDisplayWeight(effect.weight, this.units)} × ${effect.reps} reps`;
          this.lines.push(`Logged — ${summary}.`);
          if (this.sets[this.index].length < exercise.sets) this.startRest();
          else if (this.index === this.exercises.length - 1) this.ended = true;
          else {
            this.index += 1;
            this.startRest();
          }
          break;
        }
        case 'amend':
          this.sets[effect.exerciseIndex] = this.sets[effect.exerciseIndex].map((set, i) =>
            i === effect.setIndex ? { ...set, weight: effect.weight, reps: effect.reps } : set,
          );
          break;
        case 'announce':
          this.lines.push(effect.text);
          break;
        case 'set_rest_length': {
          const key = restKeyOf(this.exercises[this.index].name);
          if (effect.scope === 'workout') {
            this.restOverride = effect.seconds;
            this.restByExercise = {};
          } else if (effect.scope === 'exercise' || effect.scope === 'always') {
            this.restByExercise = { ...this.restByExercise, [key]: effect.seconds };
          }
          if (effect.scope === 'always') this.saved = { ...this.saved, [key]: effect.seconds };
          if (this.resting && this.restEndAt !== null && this.restTarget !== null) {
            this.restEndAt += (effect.seconds - this.restTarget) * 1000;
            this.restTarget = effect.seconds;
          }
          break;
        }
        case 'extend_rest':
          if (this.resting && this.restEndAt !== null && this.restTarget !== null) {
            this.restEndAt += effect.seconds * 1000;
            this.restTarget += effect.seconds;
          }
          break;
        case 'finish_rest':
        case 'start_next_set':
          this.resting = false;
          this.restEndAt = null;
          this.restFinishedAt = this.now;
          break;
        case 'undo': {
          for (let i = this.sets.length - 1; i >= 0; i--) {
            if (this.sets[i].length > 0) {
              this.sets[i] = this.sets[i].slice(0, -1);
              this.index = i;
              break;
            }
          }
          this.resting = false;
          this.restEndAt = null;
          break;
        }
        case 'remember_weight':
          this.stated = { exerciseIndex: this.index, weight: effect.weight, at: this.now };
          break;
        case 'tell_coach':
          this.toCoach.push(effect.text);
          break;
      }
    }
  }

  send(text: string, source: EngineSource = 'typed') {
    const before = this.lines.length;
    const result = decideSetInput(text, source, this.state(), this.holds);
    if (source !== 'voice' && result.effects.some((e) => e.type === 'log')) this.lastTyped = { text, at: this.now };
    this.holds = result.holds;
    this.apply(result.effects);
    return { ...result, newLines: this.lines.slice(before) };
  }

  tapConfirm() {
    const before = this.lines.length;
    const result = decideConfirmTap(this.draft, this.state(), this.holds);
    this.holds = result.holds;
    this.draft = result.draft ?? (result.handled ? '' : this.draft);
    this.apply(result.effects);
    return { ...result, newLines: this.lines.slice(before) };
  }

  record(i: number) {
    return this.sets[i].map(
      (set) => `${set.weight === null ? 'bw' : kgToDisplayWeight(set.weight, this.units)}x${set.reps}${set.unit === 'seconds' ? 's' : ''}`,
    );
  }

  total() {
    return this.sets.reduce((n, sets) => n + sets.length, 0);
  }
}

test('Damion 26 Sep, verbatim: every failure he hit on the curls no longer happens', () => {
  const w = new Workout(ARMS, '2026-09-26T17:56:26Z');

  let r = w.at('2026-09-26T18:00:12Z').send('I did 8 reps');
  assert.deepEqual(w.record(0), ['40 lbx8'], 'card shows 40 lb, so the reps-only report logs at 40 lb');
  assert.ok(!r.newLines.some((l) => /What weight/.test(l)), 'never asks for a weight the card already shows');
  assert.equal(r.newLines[0], 'Logged — 40 lb × 8 reps.', 'shows 40 lb, not 39.9');

  r = w.at('2026-09-26T18:00:21Z').send('40 lb');
  assert.equal(w.total(), 1, '"40 lb" alone is not another set');

  r = w.at('2026-09-26T18:01:02Z').send('Rest time wrong it’s supposed to be 90 seconds.. it was set for 1 minute 45 sec');
  assert.ok(r.handled);
  assert.equal(w.restFor(0), 90, 'the curls rest 90 s for the rest of the workout');
  assert.equal(w.restOverride, null, 'other exercises are left alone');
  assert.equal(w.restTarget, 90, 'the rest running now becomes 90 s too');

  r = w.at('2026-09-26T18:01:54Z').send('I said 40lb not 39.9');
  assert.equal(w.total(), 1, 'a correction never creates a set');
  assert.deepEqual(w.record(0), ['40 lbx8']);
  assert.match(r.newLines[0], /^Fixed: Incline Dumbbell Curl set 1 is now 40 lb × 8 reps/);

  r = w.at('2026-09-26T18:02:13Z').send('I haven’t done set 2 yet');
  assert.equal(r.handled, false, 'a count claim still goes to the coach, whose server check confirms the count');
  assert.equal(w.total(), 1);

  r = w.at('2026-09-26T18:03:54Z').send('39.9 lb 10 reps');
  assert.equal(w.total(), 1, 'numbers with no completion word wait for a yes');
  assert.equal(r.newLines[0], 'Log 40 lb × 10 reps as set 2 of 4 on Incline Dumbbell Curl? Reply "yes", or tap Confirm set.');
  w.at('2026-09-26T18:03:58Z').send('yes');
  assert.deepEqual(w.record(0), ['40 lbx8', '40 lbx10']);
  assert.equal(w.restTarget, 90, 'the 90 s setting sticks for the next rest');

  r = w.at('2026-09-26T18:06:28Z').send('Done 40/8');
  assert.deepEqual(w.record(0), ['40 lbx8', '40 lbx10', '40 lbx8'], '"Done 40/8" is 40 lb for 8');
  assert.equal(w.restTarget, 90);

  r = w.at('2026-09-26T18:06:44Z').send('Rest');
  assert.equal(w.total(), 3, '"Rest" never logs or starts anything');
  assert.match(r.newLines[0], /^Rest is running: 1:14 left/);
  assert.deepEqual(w.restsStarted, [105, 90, 90], 'only logged sets start rests');
});

test('Damion 26 Sep, verbatim: "Rest" with nothing logged says so and asks for the reps', () => {
  const w = new Workout(ARMS, '2026-09-26T18:00:00Z');
  const r = w.at('2026-09-26T18:00:30Z').send('Rest');
  assert.equal(w.resting, false);
  assert.deepEqual(w.restsStarted, []);
  assert.equal(r.newLines[0], 'Nothing is logged for set 1 of 4 on Incline Dumbbell Curl yet, so no rest is running. How many reps did you get?');
  w.at('2026-09-26T18:00:40Z').send('8');
  assert.deepEqual(w.record(0), ['40 lbx8'], 'the answer to that question logs');
});

test('Damion 26 Sep, verbatim: Cable Tricep Pushdown "12 reps" uses the 55 lb on the card and one tap logs it', () => {
  const w = new Workout(ARMS, '2026-09-26T17:56:26Z');
  w.index = 1;
  let r = w.at('2026-09-26T18:12:23Z').send('12 reps');
  assert.equal(r.newLines[0], 'Log 55 lb × 12 reps as set 1 of 4 on Cable Tricep Pushdown? Reply "yes", or tap Confirm set.');
  assert.ok(!r.newLines.some((l) => /What weight/.test(l)), 'never asks for the weight on the card');
  r = w.at('2026-09-26T18:12:33Z').send('12 reps');
  assert.equal(w.total(), 0, 'repeating it still only asks');
  r = w.at('2026-09-26T18:12:35Z').tapConfirm();
  assert.deepEqual(w.record(1), ['55 lbx12'], 'Confirm set logs the held set');
  assert.equal(r.newLines[0], 'Logged — 55 lb × 12 reps.');
  r = w.at('2026-09-26T18:13:21Z').send('Done 12');
  assert.deepEqual(w.record(1), ['55 lbx12', '55 lbx12'], 'a clear report logs directly');
});

test('button mashing: eight "12 reps" in five seconds never logs more than the one set confirmed', () => {
  const w = new Workout(ARMS, '2026-09-26T18:35:40Z');
  w.index = 1;
  const times = ['44.501', '45.559', '46.477', '47.335', '47.943', '48.369', '48.694', '49.018'];
  const replies: string[] = [];
  for (const t of times) replies.push(...w.at(`2026-09-26T18:35:${t}Z`).send('12 reps').newLines);
  assert.equal(w.total(), 0);
  assert.ok(replies.every((l) => l.startsWith('Log 55 lb × 12 reps as set 1 of 4')), replies.join('\n'));
  w.at('2026-09-26T18:35:50Z').send('yes');
  assert.deepEqual(w.record(1), ['55 lbx12']);
  for (const t of ['51.0', '51.4', '51.9', '52.3']) w.at(`2026-09-26T18:35:${t}Z`).send('Done 12');
  assert.equal(w.total(), 1, 'reports seconds after a logged set are held, not logged');
  assert.match(w.lines.at(-1)!, /Cable Tricep Pushdown set 1 was logged \d+s ago\. Log another one now as set 2 of 4/);
  w.at('2026-09-26T18:35:53Z').send('yes');
  assert.deepEqual(w.record(1), ['55 lbx12', '55 lbx12'], 'yes to that prompt logs the second set');
});

test('Confirm set taps never loop: first tap fills the card values, second logs, third is ignored during rest', () => {
  const w = new Workout(ARMS, '2026-09-26T18:35:40Z');
  w.index = 1;
  let r = w.at('2026-09-26T18:35:41Z').tapConfirm();
  assert.equal(w.draft, '55 lb 12 reps');
  assert.equal(w.total(), 0);
  r = w.at('2026-09-26T18:35:43Z').tapConfirm();
  assert.deepEqual(w.record(1), ['55 lbx12']);
  assert.equal(r.newLines[0], 'Logged — 55 lb × 12 reps.');
  r = w.at('2026-09-26T18:35:44Z').tapConfirm();
  assert.equal(w.total(), 1, 'a tap during the rest does nothing');
});

test('no weight anywhere: the weight question escalates, a bare number answers it, the button explains itself', () => {
  const w = new Workout([{ name: 'Lat Pulldown', sets: 3, repScheme: '10', loadScheme: 'working weight' }], '2026-09-26T10:00:00Z');
  let r = w.at('2026-09-26T10:01:00Z').send('Done, 12 reps');
  assert.equal(r.newLines[0], 'Got 12 reps. What weight was that? Nothing logged yet.');
  r = w.at('2026-09-26T10:01:05Z').send('12 reps');
  assert.match(r.newLines[0], /^I still need the weight for those 12 reps before I can log set 1 of 3 on Lat Pulldown/);
  r = w.at('2026-09-26T10:01:07Z').tapConfirm();
  assert.match(r.newLines[0], /^Say or type the weight for those 12 reps/);
  w.draft = '100';
  w.at('2026-09-26T10:01:10Z').tapConfirm();
  assert.deepEqual(w.record(0), ['100 lbx12']);
});

test('the session Damion was trying to run: every set, every rest, every exercise change', () => {
  const w = new Workout(ARMS, '2026-09-26T17:56:26Z');
  const say = (time: string, text: string) => w.at(`2026-09-26T${time}Z`).send(text);

  say('18:00:12', 'I did 8 reps');
  say('18:01:02', 'Rest time wrong it’s supposed to be 90 seconds.. it was set for 1 minute 45 sec');
  say('18:01:54', 'I said 40lb not 39.9');
  say('18:03:54', '40 lb 10 reps');
  say('18:03:57', 'yes');
  say('18:06:28', 'Done 40/8');
  say('18:06:44', 'Rest');
  say('18:08:10', 'done 10');
  assert.equal(w.index, 1, 'four curl sets move on to the pushdowns');
  assert.ok(w.resting, 'a rest runs between exercises');
  assert.equal(w.restTarget, DEFAULT_REST, 'a 90 s change on the curls stays on the curls');
  assert.equal(describeNextSetLine(w.state()), 'Set 1 of 4 on Cable Tricep Pushdown: 12 reps at 55 lb.');

  say('18:10:00', '12 reps');
  w.at('2026-09-26T18:10:02Z').tapConfirm();
  say('18:12:00', '12 reps');
  say('18:12:03', 'yes');
  say('18:14:00', 'Done 55/11');
  say('18:16:00', '12');
  assert.equal(w.lines.at(-1), '12 reps for set 4 of 4 on Cable Tricep Pushdown at 55 lb? Reply "yes" to log it.');
  say('18:16:05', 'yes');
  assert.equal(w.index, 2);
  say('18:18:00', 'I got 10');
  say('18:20:00', '9 reps at 40');
  say('18:20:03', 'yes');
  say('18:22:00', 'it was 8 not 9');
  say('18:22:30', 'I did 8');
  assert.deepEqual(w.record(0), ['40 lbx8', '40 lbx10', '40 lbx8', '40 lbx10']);
  assert.deepEqual(w.record(1), ['55 lbx12', '55 lbx12', '55 lbx11', '55 lbx12']);
  assert.deepEqual(w.record(2), ['40 lbx10', '40 lbx8', '40 lbx8']);
  assert.deepEqual(w.restsStarted.slice(1, 3), [90, 90], 'the curls keep the 90 s rest they asked for');
  assert.ok(w.restsStarted.slice(3).every((s) => s === DEFAULT_REST), `other exercises keep their own rest: ${w.restsStarted.join(',')}`);
  assert.equal(w.index, 3, 'Zone 2 is next');
});

test('voice: a bare count is confirmed first, a clear completion logs, a no drops it', () => {
  const w = new Workout(
    [{ name: 'Back Squat', sets: 4, repScheme: '8', loadScheme: '25 lb' }],
    '2026-09-28T10:00:00Z',
  );
  let r = w.at('2026-09-28T10:01:00Z').send('Eight reps at 25 pounds.', 'voice');
  assert.equal(w.total(), 0, 'no completion word: held for "Is that set done?"');
  assert.ok(w.holds.done);
  r = w.at('2026-09-28T10:01:04Z').send('Yes.', 'voice');
  assert.deepEqual(w.record(0), ['25 lbx8']);

  w.at('2026-09-28T10:01:30Z').send('That was eight reps at 25.', 'voice');
  assert.equal(w.total(), 1, 'during rest a report is held');
  w.at('2026-09-28T10:01:33Z').send('No.', 'voice');
  assert.equal(w.total(), 1);

  w.at('2026-09-28T10:03:30Z').send("Let's go.", 'voice');
  assert.equal(w.resting, false);
  w.at('2026-09-28T10:04:30Z').send('Done, eight reps.', 'voice');
  assert.deepEqual(w.record(0), ['25 lbx8', '25 lbx8']);

  r = w.at('2026-09-28T10:05:00Z').send('Eight.', 'voice');
  assert.equal(w.total(), 2, 'a bare number during rest is never a set');

  w.at('2026-09-28T10:08:00Z').send('Done.', 'voice');
  assert.ok(w.holds.details, 'a bare "Done" waits for the count');
  w.at('2026-09-28T10:08:03Z').send('Eight.', 'voice');
  assert.deepEqual(w.record(0), ['25 lbx8', '25 lbx8', '25 lbx8']);
});

test('voice: counting out loud and "I haven\'t done set two yet" never log', () => {
  const w = new Workout([{ name: 'Rear Delt Fly', sets: 3, repScheme: '10', loadScheme: '25 lb each' }], '2026-09-28T10:00:00Z');
  w.at('2026-09-28T10:00:10Z').send('One, two, three, four, five, six, seven, eight, nine, ten.', 'voice');
  assert.equal(w.total(), 0);
  w.at('2026-09-28T10:00:20Z').send("All right, let's go. One, two, three, four, five, six, seven, eight, nine, ten. Done.", 'voice');
  assert.equal(w.total(), 0);
  assert.ok(w.holds.details);
  w.at('2026-09-28T10:00:24Z').send('Ten reps.', 'voice');
  assert.deepEqual(w.record(0), ['25 lbx10']);
  w.at('2026-09-28T10:01:00Z').send("I haven't done set two yet, and I'm on the rest. It's saying next is set three. Could you please fix that?", 'voice');
  assert.equal(w.total(), 1);
});

test('typed commands Damion uses: undo, rest length as a question, iPhone apostrophes', () => {
  const w = new Workout(ARMS, '2026-09-26T18:00:00Z');
  w.at('2026-09-26T18:00:30Z').send('Done 40/8');
  let r = w.at('2026-09-26T18:00:40Z').send('Could you make sure my next rest is 90 seconds?');
  assert.equal(w.restFor(0), 90);
  assert.match(r.newLines[0], /^Rest set to 90 seconds for the rest of Incline Dumbbell Curl in this workout, including the rest running now\./);
  r = w.at('2026-09-26T18:00:50Z').send('undo');
  assert.equal(w.total(), 0);
  r = w.at('2026-09-26T18:01:00Z').send('Let’s go');
  assert.equal(w.total(), 0);
  r = w.at('2026-09-26T18:02:00Z').send('I’ll do about 10 reps');
  assert.equal(w.total(), 0, 'a plan is not a set');
});

test('round 1, a metric lifter typing shorthand: push day start to finish', () => {
  const w = new Workout(
    [
      { name: 'Bench Press', sets: 3, repScheme: '5', loadScheme: '80 kg' },
      { name: 'Overhead Press', sets: 3, repScheme: '8', loadScheme: '40 kg' },
      { name: 'Tricep Dip', sets: 3, repScheme: '10', loadScheme: 'bodyweight' },
    ],
    '2026-09-28T10:00:00Z',
    'metric',
  );
  w.wait(60).send('5 done');
  assert.deepEqual(w.record(0), ['80 kgx5']);
  assert.match(w.wait(20).send('80kg x 5').newLines[0], /^Log 80 kg × 5 reps as set 2 of 3 on Bench Press\?/);
  w.wait(3).send('no');
  assert.equal(w.total(), 1);
  assert.match(w.wait(10).send('rest 2 min pls').newLines[0], /^Rest set to 2 minutes/);
  assert.match(w.wait(15).send('how long left').newLines[0], /^1:12 of rest left/);
  w.wait(100).send('set 2: 5 reps');
  w.wait(10).send('actually that was 4');
  w.wait(150).send('82.5 x 5 done');
  assert.deepEqual(w.record(0), ['80 kgx5', '80 kgx4', '82.5 kgx5']);
  assert.match(w.wait(130).send('8').newLines[0], /^8 reps for set 1 of 3 on Overhead Press at 40 kg\?/);
  w.wait(3).send('yep');
  w.wait(125).send('did 8 @ 42.5');
  w.wait(10).send('wrong, should be 7');
  w.wait(10).send('undo that');
  w.wait(5).send('7 reps done at 42.5');
  w.wait(125).send('done 6');
  assert.deepEqual(w.record(1), ['40 kgx8', '42.5 kgx7', '42.5 kgx6']);
  w.wait(125).send('12 done');
  w.wait(1).send('12 done');
  w.wait(1).send('12 done');
  w.wait(125).send('finished 10');
  w.wait(125).send('last set 9');
  assert.deepEqual(w.record(2), ['bwx12', 'bwx10', 'bwx9'], 'mashing held, "last set 9" logs the final set');
  assert.ok(w.ended);
  assert.deepEqual(w.restsStarted.slice(1, 2), [120], 'the bench rest they asked for');
  assert.ok(w.restsStarted.slice(2).every((s) => s === DEFAULT_REST), `later exercises keep their own rest: ${w.restsStarted.join(',')}`);
});

test('round 2, an imperial lifter talking the whole time: leg day by voice', () => {
  const w = new Workout(
    [
      { name: 'Back Squat', sets: 4, repScheme: '6', loadScheme: '185 lb' },
      { name: 'Romanian Deadlift', sets: 3, repScheme: '10', loadScheme: '135 lb' },
      { name: 'Leg Press', sets: 2, repScheme: '12', loadScheme: '270 lb' },
    ],
    '2026-09-28T10:00:00Z',
  );
  const say = (seconds: number, text: string) => w.wait(seconds).send(text, 'voice');
  say(70, "Okay that's one set down, six reps.");
  assert.equal(w.total(), 0, 'held for "Is that set done?"');
  say(4, 'Yeah.');
  say(30, 'Man that was heavy. Can I get a longer rest, like three minutes?');
  say(200, 'Six.');
  assert.equal(w.total(), 1, 'a lone number is confirmed first');
  say(5, 'Yes, that one is done.');
  assert.deepEqual(w.record(0), ['185 lbx6', '185 lbx6'], '"that one" is not a number, so the yes confirms the six');
  say(190, 'Got five on that one, the last rep was a grinder.');
  say(190, 'I went up to 195 for this one, six reps, done.');
  assert.equal(w.record(0)[3], '195 lbx6', 'the weight they said, never the card weight');
  say(20, 'Wait, it was actually 190 not 195.');
  assert.deepEqual(w.record(0), ['185 lbx6', '185 lbx6', '185 lbx5', '190 lbx6']);
  say(190, 'Ten reps.');
  say(4, 'No, I was just saying what I am about to do.');
  assert.equal(w.total(), 4);
  say(40, 'Finished ten reps.');
  say(190, 'That was nine.');
  assert.equal(w.total(), 5, '"That was nine" is confirmed first');
  say(4, 'Correct.');
  say(190, 'Ten at one thirty five, done.');
  assert.deepEqual(w.record(1), ['135 lbx10', '135 lbx9', '135 lbx10']);
  say(190, 'Twelve reps at two seventy, done.');
  say(190, "That's the last one, eleven reps.");
  assert.deepEqual(w.record(2), ['270 lbx12', '270 lbx11']);
  assert.ok(w.ended);
});

test('round 3, a sloppy typer on pull day with dumbbells and a timed hold', () => {
  const w = new Workout(
    [
      { name: 'Lat Pulldown', sets: 3, repScheme: '10-12', loadScheme: '120 lb' },
      { name: 'Dumbbell Row', sets: 3, repScheme: '10', loadScheme: '50 lb each' },
      { name: 'Face Pull', sets: 2, repScheme: '15', loadScheme: 'light' },
      { name: 'Plank', sets: 2, repScheme: '45 seconds', loadScheme: null },
    ],
    '2026-09-28T10:00:00Z',
  );
  w.wait(60).send('DONE 12');
  w.wait(100).send('did 11 reps');
  w.wait(100).send('10 reps 125lbs done');
  assert.match(w.wait(5).send('oops meant 120 not 125').newLines[0], /^Fixed: Lat Pulldown set 3 is now 120 lb × 10 reps/);
  w.wait(100).send('10 ea side done');
  w.wait(100).send('50s x10 done');
  w.wait(100).send('done w 9');
  assert.deepEqual(w.record(1), ['50 lbx10', '50 lbx10', '50 lbx9']);
  assert.match(w.wait(100).send('done 15').newLines[0], /^Got 15 reps\. What weight was that\?/);
  w.wait(3).send('30');
  w.wait(100).send('done 15');
  assert.deepEqual(w.record(2), ['30 lbx15', '30 lbx15']);
  w.wait(100).send('held it for 45 sec');
  w.wait(100).send('done 50 seconds');
  assert.deepEqual(w.record(3), ['bwx45s', 'bwx50s']);
  assert.ok(w.ended);
});

test('round 4, switching between taps, typing and voice with rest tweaks and an undo', () => {
  const w = new Workout(
    [
      { name: 'Dumbbell Bench Press', sets: 3, repScheme: '8-10', loadScheme: '60 lb each' },
      { name: 'Lateral Raise', sets: 2, repScheme: '12-15', loadScheme: '15 lb each' },
    ],
    '2026-09-28T10:00:00Z',
  );
  w.wait(60).tapConfirm();
  w.wait(3).tapConfirm();
  assert.deepEqual(w.record(0), ['60 lbx10']);
  assert.match(w.wait(10).send('wait that was only 8').newLines[0], /^Fixed: Dumbbell Bench Press set 1 is now 60 lb × 8 reps/);
  w.wait(10).send('make the rests 75 seconds');
  w.wait(30).send('skip rest');
  assert.equal(w.resting, false);
  w.wait(40).send('Done, nine reps.', 'voice');
  w.wait(20).send('undo');
  w.wait(5).send('Done, ten reps.', 'voice');
  assert.deepEqual(w.record(0), ['60 lbx8', '60 lbx10']);
  w.wait(80).send('15 x 15');
  assert.match(w.wait(3).send('yes').newLines[0], /^That came through as 15 lb, but you were on 60 lb/);
  assert.equal(w.total(), 2, 'an implausible drop is checked, not logged');
  w.wait(80).send('Thirteen, done.', 'voice');
  w.wait(80).send('done 14');
  w.wait(110).send('Done, twelve.', 'voice');
  assert.deepEqual(w.record(1), ['15 lbx14', '15 lbx12']);
  assert.deepEqual(w.restsStarted.slice(1, 3), [75, 75], 'the bench press rests they asked for');
  assert.ok(w.restsStarted.slice(3).every((s) => s === DEFAULT_REST), `lateral raises keep their own rest: ${w.restsStarted.join(',')}`);
});

test('workout chatter never logs, corrects or moves a set, typed or spoken, resting or not', () => {
  const lines = [
    'wait 30 seconds', 'wait, give me a minute', 'sorry I was talking to someone', 'hold on my phone rang',
    'oops dropped my water', 'that was tough', 'that was my 3rd set', 'wait, how many sets left?', 'only 2 more sets',
    'that was 185', 'my heart rate is 150', 'felt like an 8 out of 10', 'rpe 9', 'I weigh 180', 'I did 3 sets yesterday',
    'next set I will do 12', 'going up to 65 next set', "I'm going to try 65", 'can I go up to 65?', 'should I do 12 reps?',
    'one more set', 'how many reps should I do', 'is 60 too light?', 'my shoulder hurts at 60', 'that was easy, next time 70',
    'I only have 20 minutes', 'I usually do 12', 'last week I did 10 at 55', 'in 30 seconds', 'I need water',
  ];
  for (const source of ['typed', 'voice'] as const) {
    for (const restOver of [false, true]) {
      for (const line of lines) {
        const w = new Workout([{ name: 'Dumbbell Bench Press', sets: 4, repScheme: '10', loadScheme: '60 lb each' }], '2026-09-28T10:00:00Z');
        w.wait(60).send('done 10');
        w.wait(restOver ? 125 : 5);
        const r = w.send(line, source);
        const changed = r.effects.filter((e) => ['log', 'amend', 'undo'].includes(e.type));
        assert.deepEqual(changed, [], `${source}${restOver ? ' after rest' : ' resting'}: "${line}"`);
        assert.equal(w.holds.done, null, `${source}${restOver ? ' after rest' : ' resting'}: "${line}" must not offer a set`);
      }
    }
  }
});

test('the everyday ways people report a set log, or ask first when only numbers were given', () => {
  const outcome = (line: string, source: EngineSource = 'typed') => {
    const w = new Workout([{ name: 'Dumbbell Bench Press', sets: 4, repScheme: '10', loadScheme: '60 lb each' }], '2026-09-28T10:00:00Z');
    w.wait(60).send('done 10');
    w.wait(125);
    const r = w.send(line, source);
    const log = r.effects.find((e) => e.type === 'log') as Extract<EngineEffect, { type: 'log' }> | undefined;
    if (log) return `log ${log.weight === null ? 'bw' : kgToDisplayWeight(log.weight, 'imperial')} x${log.reps}`;
    if (w.holds.done) return `ask x${w.holds.done.set.reps}`;
    return r.handled ? 'app' : 'coach';
  };
  for (const line of [
    'done 10', '10 done', 'did 10', 'got 10', 'finished 10 reps', '10 reps in the bank', 'set 2 done 10 reps', 'second set 10 reps',
    '10 reps, done', 'done, 10', 'hit 10', 'just did 10', 'completed 10', 'Finished with 10', 'done w/ 10', 'DONE 10!!',
    'done 10 👍', 'got all 10', 'Done. 10.',
  ]) {
    assert.equal(outcome(line), 'log 60 lb x10', line);
  }
  for (const line of ['done 10 at 65', '65 lb 10 reps done', 'did 10 with 65', 'went up to 65, did 10', 'Done 65/10']) {
    assert.equal(outcome(line), 'log 65 lb x10', line);
  }
  for (const line of ['60x10', '60 for 10', '10 @ 60', '10', '10 reps', 'that was 10', "that's 10"]) {
    assert.equal(outcome(line), 'ask x10', line);
  }
  for (const line of ['Done, ten.', 'Ten reps done.', 'Got all ten.', 'Finished. Ten reps.', 'Okay done with ten.', 'I did ten.', 'Nailed all ten.', 'Knocked out ten.']) {
    assert.equal(outcome(line, 'voice'), 'log 60 lb x10', line);
  }
  for (const line of ['Ten.', 'Ten reps.', "That's ten."]) {
    assert.equal(outcome(line, 'voice'), 'ask x10', line);
  }
  assert.equal(outcome('Ten at sixty five, done.', 'voice'), 'log 65 lb x10');
});

test('"undo" while the app is asking about a set cancels the question, never a set already saved', () => {
  const w = new Workout(
    [
      { name: 'Cable Tricep Pushdown', sets: 1, repScheme: '12', loadScheme: '55 lb' },
      { name: 'Hammer Curl', sets: 3, repScheme: '8-10', loadScheme: '40 lb each' },
    ],
    '2026-09-28T18:00:00Z',
  );
  w.wait(60).send('done 12');
  assert.equal(w.index, 1);
  w.wait(120).send('ten at forty, done');
  assert.deepEqual(w.record(1), ['40 lbx10'], 'the first set of the new exercise logs without being challenged');

  assert.match(w.wait(11).send('ten at forty, done').newLines[0], /was logged 11s ago\. Log another one now as set 2 of 3 on Hammer Curl/);
  const r = w.wait(3).send('undo');
  assert.deepEqual(w.record(0), ['55 lbx12'], 'the saved pushdown set stays');
  assert.deepEqual(w.record(1), ['40 lbx10'], 'the saved hammer curl set stays');
  assert.equal(w.index, 1);
  assert.equal(r.newLines[0], 'Okay, not logged. Set 2 of 3 on Hammer Curl is still open.');
  w.wait(120).send('ten at forty, done');
  w.wait(20).send('undo');
  assert.deepEqual(w.record(1), ['40 lbx10'], 'with nothing pending, undo removes the last saved set');
  assert.deepEqual(w.record(0), ['55 lbx12']);
});

test('1 Oct: the first set of a new exercise is never challenged as a repeat of the last one', () => {
  const w = new Workout(
    [
      { name: 'Cable Tricep Pushdown', sets: 1, repScheme: '12', loadScheme: '55 lb' },
      { name: 'Hammer Curl', sets: 3, repScheme: '8-10', loadScheme: '40 lb each' },
    ],
    '2026-10-01T18:00:00Z',
  );
  w.wait(60).send('done 12');
  assert.equal(w.index, 1, 'the app moved on by itself');
  const next = w.wait(13).send('done 10');
  assert.ok(!next.newLines.some((line) => /Reply "yes" to log it/.test(line)), 'no confirm prompt at a transition');
  assert.deepEqual(w.record(1), ['40 lbx10']);
});

test('the undo message names the set it removed', () => {
  const w = new Workout([{ name: 'Hammer Curl', sets: 3, repScheme: '8-10', loadScheme: '40 lb each' }], '2026-09-28T18:00:00Z');
  assert.equal(describeUndo(w.state()), 'Nothing is logged yet, so there is nothing to undo.');
  w.wait(60).send('did 9');
  assert.equal(describeUndo(w.state()), 'Removed Hammer Curl set 1 (40 lb × 9 reps). Set 1 of 3 on Hammer Curl is open again.');
});

test('Damion 29 Sep rest rules: "make it 90" is this exercise, "add 20" is this rest, "always" saves, every exercise only when said', () => {
  const w = new Workout(ARMS, '2026-09-29T10:00:00Z');
  w.wait(30).send('Done 40/8');
  assert.equal(w.restTarget, DEFAULT_REST);

  let r = w.wait(5).send('Make it 90 seconds');
  assert.equal(w.restTarget, 90, 'the rest running now becomes 90 s');
  assert.equal(w.restFor(0), 90);
  assert.equal(w.restFor(1), null, 'the pushdowns are untouched');
  assert.equal(r.newLines[0], 'Rest set to 90 seconds for the rest of Incline Dumbbell Curl in this workout, including the rest running now.');

  w.wait(95).send('Done 40/10');
  assert.equal(w.restTarget, 90, 'the next curl rest is still 90 s, it never reverts');

  r = w.wait(5).send('Add 20 seconds');
  assert.equal(w.restTarget, 110, 'only the rest running now gets longer');
  assert.equal(r.newLines[0], 'Added 20 seconds to this rest. Later rests are unchanged.');
  assert.equal(w.restFor(0), 90);

  w.wait(115).send('Done 40/8');
  assert.equal(w.restTarget, 90, 'the extra 20 s was for one rest only');
  w.wait(95).send('Done 40/8');
  assert.equal(w.index, 1);
  assert.equal(w.restTarget, DEFAULT_REST, 'moving on to the pushdowns uses their own rest');

  r = w.wait(5).send('Always use 2 minutes for this exercise');
  assert.equal(w.restTarget, 120);
  assert.equal(w.restFor(1), 120);
  assert.equal(w.saved['cable tricep pushdown'], 120, 'saved for future workouts');
  assert.equal(
    r.newLines[0],
    'Rest set to 2 minutes for Cable Tricep Pushdown, saved for future workouts too, starting with the rest running now.',
  );

  w.wait(125).send('Done 55/12');
  assert.equal(w.restTarget, 120);

  r = w.wait(5).send('make all my rests 60 seconds');
  assert.equal(w.restOverride, 60);
  assert.equal(w.restTarget, 60);
  assert.equal(r.newLines[0], 'Rest set to 1 minute for every exercise in this workout, including the rest running now.');
  assert.equal(w.restFor(2), 60, 'every exercise now, because they said all');

  r = w.wait(5).send('just this rest, make it 2 minutes');
  assert.equal(w.restTarget, 120);
  assert.equal(r.newLines[0], 'This rest is now 2 minutes. Later rests are unchanged.');
  assert.equal(w.restFor(1), 60);
});

test('rest changes out loud never log a set, and a timed hold ignores rest instructions', () => {
  const w = new Workout(
    [
      { name: 'Barbell Row', sets: 3, repScheme: '8', loadScheme: '95 lb' },
      { name: 'Plank', sets: 3, repScheme: '45 seconds', loadScheme: null },
    ],
    '2026-09-29T10:00:00Z',
  );
  w.wait(30).send('Done, eight reps.', 'voice');
  assert.equal(w.total(), 1);
  let r = w.wait(5).send('Make it 90 seconds.', 'voice');
  assert.ok(r.handled);
  assert.deepEqual(r.effects, [], 'the server applies spoken rest changes, the phone only stays out of the way');
  r = w.wait(5).send('Add twenty seconds.', 'voice');
  assert.ok(r.handled);
  assert.deepEqual(r.effects, []);
  assert.equal(w.total(), 1);

  w.wait(200).send('Done 95/8');
  w.wait(200).send('Done 95/8');
  assert.equal(w.index, 1);
  w.wait(200);
  assert.equal(w.resting, false);
  for (const text of ['add 20 seconds', 'make it 90 seconds', 'set it to 60 seconds', '30 more seconds']) {
    for (const source of ['typed', 'voice'] as const) {
      w.wait(1).send(text, source);
      assert.equal(w.total(), 3, `"${text}" (${source}) on a plank is not a hold`);
    }
  }
  r = w.wait(1).send('add 20 seconds to my rest');
  assert.equal(r.newLines[0], 'No rest is running right now, so there is nothing to add time to.');
  w.wait(1).send('45 seconds');
  assert.deepEqual(w.record(1), ['bwx45s'], 'a plain duration still logs the hold');
});

const LOWER: EngineExercise[] = [
  { name: 'Hip Thrust', sets: 4, repScheme: '5-6', loadScheme: 'light — find your working weight' },
  { name: 'Glute Bridge', sets: 3, repScheme: '8-10', loadScheme: 'bodyweight' },
  { name: 'Leg Curl', sets: 3, repScheme: '8-10', loadScheme: 'light — find your working weight' },
  { name: 'Calf Raise', sets: 3, repScheme: '10-12', loadScheme: 'light — find your working weight' },
];

test('29 Sep: "Okay. Start set three now." ends the rest, the way the button does', () => {
  const w = new Workout(LOWER, '2026-09-30T03:13:00Z');
  w.send('70 pounds');
  w.wait(10).send('Done');
  w.wait(3).send('8');
  assert.equal(w.resting, true);

  const r = w.wait(20).send('Okay. Start set three now.', 'voice');
  assert.ok(r.handled, 'the spoken start command was not recognised');
  assert.deepEqual(r.effects, [{ type: 'start_next_set' }]);
  assert.equal(w.resting, false, 'the rest timer kept running after he asked to start');

  for (const phrase of ['Start set three now', 'start set 3 now', "I'm ready for set three now", 'skip the rest please']) {
    const fresh = new Workout(LOWER, '2026-09-30T03:13:00Z');
    fresh.send('70 pounds');
    fresh.wait(10).send('Done');
    fresh.wait(3).send('8');
    assert.equal(fresh.wait(20).send(phrase, 'voice').effects[0]?.type, 'start_next_set', phrase);
  }
});

test('29 Sep: changing the weight before set three moves the card and the saved set', () => {
  const w = new Workout(LOWER, '2026-09-30T03:13:00Z');
  w.send('70 pounds');
  w.wait(10).send('Done');
  w.wait(3).send('8');
  w.wait(110).send('Done');
  w.wait(3).send('6');
  assert.deepEqual(w.record(0), ['70 lbx8', '70 lbx6']);

  const r = w.wait(10).send("At the end of the next set, I'm gonna go to 80 pound.", 'voice');
  assert.deepEqual(r.effects, [{ type: 'remember_weight', weight: 36.3 }], 'the weight change was not picked up');
  assert.equal(w.stated?.weight, 36.3);

  w.wait(30).send("Let's go", 'voice');
  w.wait(20).send('Done', 'voice');
  w.wait(3).send('Six.', 'voice');
  assert.deepEqual(w.record(0), ['70 lbx8', '70 lbx6', '80 lbx6'], 'set three saved at the old weight');
  assert.match(describeNextSetLine(w.state()) ?? '', /80 lb/, 'the card still offers the old weight');
});

test('29 Sep: "I asked for 80 pounds, you still said 70" is never a 70-rep set', () => {
  const w = new Workout(LOWER, '2026-09-30T03:13:00Z');
  w.send('70 pounds');
  w.wait(10).send('Done');
  w.wait(3).send('8');
  w.wait(120);

  const r = w.send('I remember I asked for 80 pounds, you still said 70.', 'voice');
  assert.deepEqual(r.effects, [{ type: 'remember_weight', weight: 36.3 }]);
  assert.equal(w.holds.done, null, 'the app held a set and the coach was told to ask "Is that set done?"');
  assert.equal(w.total(), 1, 'nothing new should be logged by a complaint about the weight');
});

test('29 Sep: a weight the app is waiting on never traps the workout', () => {
  const w = new Workout(LOWER, '2026-09-30T03:22:00Z');
  w.index = 2;

  const first = w.send('10 reps');
  assert.match(first.newLines[0], /What weight was that\?/);
  assert.equal(
    first.effects.filter((e) => e.type === 'tell_coach').length,
    1,
    'the coach was not told the app is blocked, so it carried on with its own script',
  );
  assert.match(w.toCoach.at(-1) ?? '', /holding 10 reps/);

  const taps = [w.wait(1).tapConfirm(), w.wait(1).tapConfirm(), w.wait(1).tapConfirm()];
  for (const tap of taps) assert.match(tap.newLines[0], /Say or type the weight for those 10 reps/);
  assert.match(taps[0].newLines[0], /"skip" to drop them/, 'the nag offers no way out');
  assert.doesNotMatch(taps[0].newLines[0], /^Type /, 'a hands-free user was told to type');

  const out = w.wait(2).send('skip');
  assert.ok(out.handled);
  assert.equal(w.holds.weight, null, 'the hold survived an explicit "skip"');
  assert.equal(w.total(), 0);
  assert.match(out.newLines[0], /Dropped those 10 reps/);

  w.wait(2).send('Done 45 lb x 10');
  assert.deepEqual(w.record(2), ['45 lbx10'], 'the workout could not move on after the hold cleared');
});

test('29 Sep: Damion\'s whole session replays clean, start to finish', () => {
  const w = new Workout(LOWER, '2026-09-30T03:13:30Z');

  w.at('2026-09-30T03:13:34Z').send('70 pounds');
  assert.equal(w.stated?.weight, 31.8, 'the opening weight was not remembered');
  w.at('2026-09-30T03:13:47Z').send('Done');
  w.at('2026-09-30T03:13:50Z').send('8');
  assert.deepEqual(w.record(0), ['70 lbx8']);

  w.at('2026-09-30T03:14:08Z').send('It’s supposed to be 90 seconds rest');
  assert.equal(w.restFor(0), 90, 'the 90s rest request did not stick to Hip Thrust');

  w.at('2026-09-30T03:14:38Z').send('All right, done.', 'voice');
  assert.equal(w.total(), 1, '"All right, done." must not skip the rest or log on its own');
  w.at('2026-09-30T03:14:44Z').send('Six.', 'voice');
  assert.deepEqual(w.record(0), ['70 lbx8', '70 lbx6']);

  w.at('2026-09-30T03:14:54Z').send("At the end of the next set, I'm gonna go to 80 pound.", 'voice');
  assert.equal(w.stated?.weight, 36.3, 'the jump to 80 lb was dropped');

  const start = w.at('2026-09-30T03:15:21Z').send('Okay. Start set three now.', 'voice');
  assert.deepEqual(start.effects, [{ type: 'start_next_set' }]);
  assert.equal(w.resting, false, 'the screen stayed on rest after he asked to start');

  const complaint = w.at('2026-09-30T03:16:19Z').send('I remember I asked for 80 pounds, you still said 70.', 'voice');
  assert.deepEqual(complaint.effects, [{ type: 'remember_weight', weight: 36.3 }]);
  assert.equal(w.holds.done, null, 'the complaint was held as a set awaiting "Is that set done?"');
  assert.equal(w.total(), 2, 'the complaint logged something');

  w.at('2026-09-30T03:16:34Z').send("No, it's not done.", 'voice');
  w.at('2026-09-30T03:16:43Z').send('Done.', 'voice');
  w.at('2026-09-30T03:16:47Z').send('Six.', 'voice');
  assert.deepEqual(w.record(0), ['70 lbx8', '70 lbx6', '80 lbx6'], 'set three saved at the old 70 lb');

  w.at('2026-09-30T03:16:54Z').restOver();
  w.at('2026-09-30T03:16:57Z').send('Done.', 'voice');
  w.at('2026-09-30T03:17:10Z').send('Done.', 'voice');
  w.at('2026-09-30T03:17:16Z').send('Six.', 'voice');
  assert.deepEqual(w.record(0), ['70 lbx8', '70 lbx6', '80 lbx6', '80 lbx6'], 'Hip Thrust did not finish on 80 lb');
  assert.equal(w.index, 1, 'the workout did not advance to Glute Bridge');

  w.at('2026-09-30T03:17:37Z').restOver();
  w.at('2026-09-30T03:17:47Z').send('Done.', 'voice');
  w.at('2026-09-30T03:17:51Z').send('Ten.', 'voice');
  assert.deepEqual(w.record(1), ['bwx10']);

  w.at('2026-09-30T03:19:23Z').restOver();
  w.coachLine = 'How many reps did you get?';
  w.at('2026-09-30T03:22:35Z').send('10 reps');
  const second = w.at('2026-09-30T03:22:37Z').send('10 reps');
  const third = w.at('2026-09-30T03:22:39Z').send('10 reps');
  for (const dup of [second, third]) assert.match(dup.newLines[0], /same message twice/);
  assert.deepEqual(w.record(1), ['bwx10', 'bwx10'], 'a phantom Glute Bridge set was logged from a double send');
  assert.equal(w.index, 1, 'the duplicates pushed him onto the next exercise mid-sentence');

  w.at('2026-09-30T03:23:42Z').send('Mm-hmm.', 'voice');
  assert.equal(w.total(), 6, 'a filler word changed the record');
  assert.equal(w.holds.weight, null, 'the workout is sitting in a weight hold it cannot leave');
});

test('1 Oct: a weight stated in the same breath as "start set one" is kept, not thrown away', () => {
  const w = new Workout(LOWER, '2026-10-01T03:23:00Z');
  w.resting = true;
  w.restEndAt = w.now + 60_000;

  const start = w.at('2026-10-01T03:23:10Z').send('Start set one. 95 pounds');
  assert.deepEqual(start.effects, [{ type: 'remember_weight', weight: 43.1 }, { type: 'start_next_set' }]);
  assert.equal(w.stated?.weight, 43.1, 'the card must carry the weight they just gave');

  const done = w.at('2026-10-01T03:23:40Z').send('Done 10 reps');
  assert.equal(w.holds.weight, null, 'it must not ask for a weight it was already given');
  assert.deepEqual(w.record(0), ['95 lbx10']);
  assert.ok(!done.newLines.some((line) => /what weight/i.test(line)), 'the weight question must not be asked');
});

test('1 Oct: a plain "start set two" with no weight still just starts the set', () => {
  const w = new Workout(LOWER, '2026-10-01T03:23:00Z');
  w.resting = true;
  w.restEndAt = w.now + 60_000;
  assert.deepEqual(w.at('2026-10-01T03:23:05Z').send('Okay. Start set two now.').effects, [{ type: 'start_next_set' }]);
});

test('1 Oct: "I didn’t do that set" while reps are held never deletes a real set from an earlier exercise', () => {
  const w = new Workout(LOWER, '2026-10-01T03:20:00Z');
  w.at('2026-10-01T03:20:05Z').send('60 pounds');
  w.at('2026-10-01T03:20:10Z').send('Done 8 reps');
  assert.deepEqual(w.record(0), ['60 lbx8'], 'Hip Thrust set 1 is genuinely logged');

  w.index = 2;
  w.resting = false;
  w.at('2026-10-01T03:21:00Z').send('Done 10 reps');
  assert.ok(w.holds.weight, 'Leg Curl has no weight yet, so the reps are held');
  assert.match(w.toCoach.join(' '), /NEVER call undo_last_set/);

  const undo = w.at('2026-10-01T03:21:20Z').send("No wait, I didn't do that set. Undo it");
  assert.ok(!undo.effects.some((e) => e.type === 'undo'), 'it must not undo a set that was never logged');
  assert.deepEqual(w.record(0), ['60 lbx8'], 'the real Hip Thrust set must survive');
  assert.equal(w.holds.weight, null, 'the held reps are dropped');
});

test('1 Oct: while reps are held, the coach is told the app already asked so it cannot ask twice', () => {
  const w = new Workout(LOWER, '2026-10-01T03:21:00Z');
  w.index = 2;
  const held = w.at('2026-10-01T03:21:10Z').send('Done 10 reps');
  const appLine = held.newLines.find((line) => /what weight was that/i.test(line));
  assert.ok(appLine, 'the app asks on screen');
  const note = w.toCoach.join(' ');
  assert.match(note, /ALREADY asked them for the weight on screen/);
  assert.match(note, /do not ask again/);
});

test('1 Oct voice: the first set of a new exercise logs during the transition rest, it is not queried as a repeat', () => {
  const w = new Workout(LOWER, '2026-10-01T04:43:00Z');
  w.at('2026-10-01T04:43:05Z').send('Sixty pounds', 'voice');
  w.at('2026-10-01T04:43:10Z').send('Done twelve reps', 'voice');
  assert.deepEqual(w.record(0), ['60 lbx12']);

  w.index = 1;
  w.resting = true;
  w.restEndAt = Date.parse('2026-10-01T04:44:00Z');
  const first = w.at('2026-10-01T04:43:40Z').send('Using 60 pounds, done 12 reps.', 'voice');
  assert.ok(
    !first.newLines.some((line) => /another set done/i.test(line)),
    'a complete report on an exercise with nothing logged must not be queried as a repeat',
  );
  assert.deepEqual(w.record(1), ['60 lbx12'], 'it logs first time');
});

test('1 Oct voice: on an exercise that already has a set, a report during rest is still confirmed first', () => {
  const w = new Workout(LOWER, '2026-10-01T04:43:00Z');
  w.at('2026-10-01T04:43:05Z').send('Sixty pounds', 'voice');
  w.at('2026-10-01T04:43:10Z').send('Done twelve reps', 'voice');
  w.resting = true;
  w.restEndAt = Date.parse('2026-10-01T04:45:00Z');
  const again = w.at('2026-10-01T04:44:30Z').send('Done, twelve reps.', 'voice');
  assert.deepEqual(w.record(0), ['60 lbx12'], 'nothing extra is logged until they confirm');
  assert.ok(!again.effects.some((e) => e.type === 'log'));
});

test('1 Oct voice: naming the exercise ends the rest, the way "start set two" does', () => {
  const w = new Workout(
    [
      { name: 'Barbell Curl', sets: 3, repScheme: '8-10', loadScheme: 'light' },
      { name: 'Overhead Tricep Extension', sets: 3, repScheme: '10-12', loadScheme: 'light' },
    ],
    '2026-10-01T04:43:00Z',
  );
  w.index = 1;
  w.resting = true;
  w.restEndAt = Date.parse('2026-10-01T04:44:00Z');

  for (const line of [
    'Start Overhead Triceps Extension.',
    'start overhead tricep extension',
    "Okay, let's start overhead tricep extension",
    'Go to overhead tricep extension',
    'Start the next exercise',
    'Start the next one',
  ]) {
    w.resting = true;
    w.restEndAt = Date.parse('2026-10-01T04:44:00Z');
    const r = w.at('2026-10-01T04:43:20Z').send(line, 'voice');
    assert.deepEqual(r.effects, [{ type: 'start_next_set' }], line);
  }

  w.resting = true;
  w.restEndAt = Date.parse('2026-10-01T04:44:00Z');
  const wrong = w.at('2026-10-01T04:43:25Z').send('Start barbell curl', 'voice');
  assert.deepEqual(wrong.effects, [], 'naming a DIFFERENT exercise is not a start command for this one');

  w.resting = true;
  w.restEndAt = Date.parse('2026-10-01T04:44:00Z');
  const partial = w.at('2026-10-01T04:43:30Z').send("Let's start the tricep extension", 'voice');
  assert.deepEqual(
    partial.effects,
    [],
    'a partial name is deliberately NOT matched: every word of the exercise must be said, so "curl" cannot pick the wrong curl',
  );
});

test('1 Oct voice: complaining about what the coach SAID never rewrites a logged set', () => {
  const w = new Workout(
    [{ name: 'Barbell Curl', sets: 3, repScheme: '8-10', loadScheme: 'light' }],
    '2026-10-01T04:56:00Z',
  );
  w.at('2026-10-01T04:56:20Z').send('Done 10 reps.', 'voice');
  w.at('2026-10-01T04:56:26Z').send('40 pounds.', 'voice');
  assert.deepEqual(w.record(0), ['40 lbx10']);

  w.at('2026-10-01T04:57:56Z').send('Okay, start set two now.', 'voice');
  w.at('2026-10-01T04:58:07Z').send("At the end of next set, I'm gonna go to 50 pound.", 'voice');
  w.at('2026-10-01T04:58:19Z').send('Done eight reps.', 'voice');
  const afterSetTwo = w.record(0);

  const complaint = w
    .at('2026-10-01T04:58:38Z')
    .send('I remember I asked for 40 pounds. You still said 40. Uh, sorry. I remember I asked for 50 pounds. You still said 40.', 'voice');

  assert.ok(
    !complaint.effects.some((e) => e.type === 'amend'),
    'a sentence about what was SAID must never amend a saved set',
  );
  assert.deepEqual(w.record(0), afterSetTwo, 'the saved sets are untouched by the complaint');
  assert.equal(w.total(), 2, 'and it logs nothing new');
});

test('2 Oct voice: "I\'m gonna use 90 pounds for the rest of the sets" moves the card, not just the coach', () => {
  const w = new Workout(
    [{ name: 'Incline Dumbbell Press', sets: 3, repScheme: '9-11', loadScheme: 'moderate' }],
    '2026-10-02T06:55:00Z',
  );
  w.at('2026-10-02T06:55:20Z').send('Eleven reps at seventy pounds.', 'voice');
  w.at('2026-10-02T06:55:26Z').send('Yes.', 'voice');
  assert.deepEqual(w.record(0), ['70 lbx11']);

  const stated = w.at('2026-10-02T06:56:10Z').send("I'm gonna use 90 pounds for the rest of set.", 'voice');
  assert.deepEqual(stated.effects, [{ type: 'remember_weight', weight: 40.8 }], 'the app heard nothing and only the coach replied');
  assert.equal(w.stated?.weight, 40.8, 'the card must read 90 lb the moment they say it');
  assert.match(describeNextSetLine(w.state()) ?? '', /90 lb/);

  w.at('2026-10-02T06:56:40Z').send('Start set two.', 'voice');
  w.at('2026-10-02T06:57:10Z').send('Done ten.', 'voice');
  assert.deepEqual(w.record(0), ['70 lbx11', '90 lbx10'], 'set two saved at the old weight');
});

test('2 Oct voice: a stated weight carrying trailing words is still only a weight, never a set', () => {
  const w = new Workout(
    [{ name: 'Incline Dumbbell Press', sets: 3, repScheme: '9-11', loadScheme: 'moderate' }],
    '2026-10-02T06:55:00Z',
  );
  for (const line of [
    "I'm gonna use 90 pounds for the rest of the sets.",
    'Using 90 pounds from here on.',
    "Let's go with 90 pounds for the next few.",
    "I'm staying at 90 pounds for the rest of this one.",
  ]) {
    const r = w.wait(30).send(line, 'voice');
    assert.deepEqual(r.effects, [{ type: 'remember_weight', weight: 40.8 }], `"${line}" was not read as a weight`);
    assert.equal(w.total(), 0, `"${line}" logged a set`);
  }
});

test('2 Oct: "use" phrasing about reps or sets is never mistaken for a weight', () => {
  const w = new Workout(
    [{ name: 'Incline Dumbbell Press', sets: 3, repScheme: '9-11', loadScheme: 'moderate' }],
    '2026-10-02T06:55:00Z',
  );
  for (const line of ["Let's use 12 reps this time.", "I'm gonna use 4 sets instead."]) {
    const r = w.wait(30).send(line, 'voice');
    assert.ok(
      !r.effects.some((e) => e.type === 'remember_weight'),
      `"${line}" was read as a weight`,
    );
    assert.equal(w.total(), 0);
  }
});

const PUSH: EngineExercise[] = [
  { name: 'Bench Press', sets: 3, repScheme: '8-10', loadScheme: 'moderate' },
  { name: 'Incline Dumbbell Press', sets: 3, repScheme: '9-11', loadScheme: 'moderate' },
  { name: 'Overhead Press', sets: 3, repScheme: '8-10', loadScheme: 'moderate' },
];

test('2 Oct voice: "the weight was not 80, it was 100" corrects the set it names, across a transition', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 1;
  w.wait(5).send('Eleven reps at seventy pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  w.wait(60).send('Done ten at ninety.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  w.wait(60).send('Set 3, done 11 reps at eighty.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  assert.deepEqual(w.record(1), ['70 lbx11', '90 lbx10', '80 lbx11']);

  w.index = 2;
  const fix = w.wait(10).send('Actually, the weight was not, uh, 80, it was 100.', 'voice');
  assert.deepEqual(
    fix.effects.filter((e) => e.type === 'amend'),
    [{ type: 'amend', exerciseIndex: 1, setIndex: 2, weight: 45.4, reps: 11 }],
    'the correction did not reach the set it named',
  );
  assert.deepEqual(w.record(1), ['70 lbx11', '90 lbx10', '100 lbx11']);
  assert.equal(w.record(2).length, 0, 'a correction invented a set on the exercise that just started');
  assert.match(w.toCoach.join(' '), /ALREADY corrected/);
});

test('2 Oct voice: an unclear correction is held, so the answer amends instead of logging a new set', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 1;
  w.wait(5).send('Eleven reps at eighty pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  assert.deepEqual(w.record(1), ['80 lbx11']);

  w.index = 2;
  const ask = w.wait(10).send('Sorry, the last set was wrong.', 'voice');
  assert.ok(ask.handled, 'the app let an explicit correction fall through to the coach');
  assert.match(ask.newLines.join(' '), /What should Incline Dumbbell Press set 1 be\?/, 'the question never reached the screen on voice');
  assert.match(w.toCoach.join(' '), /waiting on a correction to Incline Dumbbell Press set 1/);

  const reply = w.wait(11).send('It was 100 pounds, 11 reps.', 'voice');
  assert.deepEqual(
    reply.effects.filter((e) => e.type === 'log'),
    [],
    'the answer to a correction was logged as a brand new set',
  );
  assert.deepEqual(
    reply.effects.filter((e) => e.type === 'amend'),
    [{ type: 'amend', exerciseIndex: 1, setIndex: 0, weight: 45.4, reps: 11 }],
  );
  assert.deepEqual(w.record(1), ['100 lbx11']);
  assert.equal(w.record(2).length, 0, 'the phantom set landed on Overhead Press');
  assert.match(w.toCoach.join(' '), /never say you have no tool for it/);
});

test('2 Oct: a held correction expires rather than swallowing a real set two minutes later', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 1;
  w.wait(5).send('Eleven reps at eighty pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  w.wait(10).send('Sorry, the last set was wrong.', 'voice');

  w.wait(200).send('Done ten at eighty.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  assert.deepEqual(w.record(1), ['80 lbx11', '80 lbx10'], 'a stale correction hold ate a real set');
});

test('2 Oct: a real set reported while a correction is held is logged, not swallowed as the answer', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 1;
  w.wait(5).send('Eleven reps at eighty pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  w.wait(100).send('Sorry, the last set was wrong.', 'voice');

  w.wait(20).send('Done ten reps at eighty.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  assert.deepEqual(w.record(1), ['80 lbx11', '80 lbx10'], 'the correction hold ate a genuine new set');
});

test('2 Oct voice: a garbled "undo last set" asks before removing anything', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 2;
  w.wait(5).send('Eleven reps at a hundred pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');

  const heard = w.wait(20).send('A new last set.', 'voice');
  assert.ok(!heard.effects.some((e) => e.type === 'undo'), 'a misheard phrase deleted a real set outright');
  assert.match(
    heard.newLines.join(' '),
    /Did you mean undo\?/,
    'on voice the question only went to the coach, which is free to ignore it',
  );
  assert.deepEqual(w.record(2), ['100 lbx11'], 'nothing may be removed before they confirm');
  assert.match(w.toCoach.join(' '), /Nothing has been removed/);

  const yes = w.wait(5).send('Yes.', 'voice');
  assert.ok(yes.effects.some((e) => e.type === 'undo'));
  assert.equal(w.record(2).length, 0);
  assert.match(w.toCoach.join(' '), /Set 1 of 3 on Overhead Press is open again/);
});

test('2 Oct voice: declining a garbled undo leaves the set alone', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 2;
  w.wait(5).send('Eleven reps at a hundred pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  w.wait(20).send('And do the last set.', 'voice');
  w.wait(5).send('No.', 'voice');
  assert.deepEqual(w.record(2), ['100 lbx11']);
});

test('2 Oct: "I can\'t undo that" is never an undo request', () => {
  const w = new Workout(PUSH, '2026-10-02T06:40:00Z');
  w.index = 2;
  w.wait(5).send('Eleven reps at a hundred pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  const r = w.wait(20).send("I can't undo that.", 'voice');
  assert.ok(!r.effects.some((e) => e.type === 'undo'));
  assert.deepEqual(w.record(2), ['100 lbx11']);
});

test('2 Oct: polite and garbled undo requests are told apart from each other and from a refusal', () => {
  for (const line of [
    'Uh, the last set, can you undo that?',
    'Can you undo that?',
    'Could you delete that last set?',
    'Take the last set off.',
  ]) {
    assert.ok(looksLikeUndoRequest(line), `not read as an undo request: "${line}"`);
    assert.ok(!looksLikeMisheardUndo(line), `wrongly read as garbled: "${line}"`);
  }
  for (const line of [
    'A new last set.',
    'And do the last set.',
    'Undue the last set.',
    'Until the last set.',
    'Under the last set.',
    'Into the last set.',
  ]) {
    assert.ok(looksLikeMisheardUndo(line), `not read as a garbled undo: "${line}"`);
  }
  for (const line of [
    "I can't undo that.",
    'Done 10 reps.',
    'Start set two.',
    "I'm staying at 80 until the last set.",
    'Keep this weight until the last set.',
  ]) {
    assert.ok(!looksLikeUndoRequest(line), `wrongly read as an undo request: "${line}"`);
    assert.ok(!looksLikeMisheardUndo(line), `wrongly read as a garbled undo: "${line}"`);
  }
});

const LOWER_DAY: EngineExercise[] = [
  { name: 'Back Squat', sets: 4, repScheme: '6-8', loadScheme: 'moderate' },
  { name: 'Romanian Deadlift', sets: 3, repScheme: '8-10', loadScheme: 'moderate' },
];

test('2 Oct: "that last one was at 100, not 80" corrects to 100, never to 1', () => {
  const w = new Workout(LOWER_DAY, '2026-10-02T09:35:00Z');
  w.wait(5).send('Eight reps at eighty pounds.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  assert.deepEqual(w.record(0), ['80 lbx8']);

  const fix = w.wait(15).send('That last one was at 100, not 80.', 'voice');
  assert.deepEqual(
    fix.effects.filter((e) => e.type === 'amend'),
    [{ type: 'amend', exerciseIndex: 0, setIndex: 0, weight: 45.4, reps: 8 }],
    'the pronoun "one" was read as the weight',
  );
  assert.deepEqual(w.record(0), ['100 lbx8']);

  w.wait(30).send('Set two, done eight reps.', 'voice');
  w.wait(4).send('Yes.', 'voice');
  assert.deepEqual(w.record(0), ['100 lbx8', '100 lbx8'], 'set two carried a bogus weight forward');
});

test('2 Oct: every "last one" phrasing of a correction lands on the real number', () => {
  for (const line of [
    'That last one was at 100, not 80.',
    'That last one was at a hundred, not eighty.',
    'The last one was a hundred pounds, not eighty.',
    'Actually that last one was 100.',
  ]) {
    const w = new Workout(LOWER_DAY, '2026-10-02T09:35:00Z');
    w.wait(5).send('Eight reps at eighty pounds.', 'voice');
    w.wait(4).send('Yes.', 'voice');
    w.wait(15).send(line, 'voice');
    assert.deepEqual(w.record(0), ['100 lbx8'], `"${line}" did not correct to 100 lb`);
  }
});
