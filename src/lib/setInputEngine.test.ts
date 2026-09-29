import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  stated: { exerciseIndex: number; weight: number } | null = null;
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
      now: this.now,
    };
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
          this.stated = { exerciseIndex: this.index, weight: effect.weight };
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
  assert.match(r.newLines[0], /^Type the weight for those 12 reps/);
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
  assert.match(w.wait(11).send('ten at forty, done').newLines[0], /was logged 11s ago\. Log another one now as set 1 of 3 on Hammer Curl/);
  const r = w.wait(3).send('undo');
  assert.deepEqual(w.record(0), ['55 lbx12'], 'the saved pushdown set stays');
  assert.equal(w.index, 1);
  assert.equal(r.newLines[0], 'Okay, not logged. Set 1 of 3 on Hammer Curl is still open.');
  w.wait(120).send('ten at forty, done');
  w.wait(20).send('undo');
  assert.deepEqual(w.record(1), [], 'with nothing pending, undo removes the last saved set');
  assert.deepEqual(w.record(0), ['55 lbx12']);
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
