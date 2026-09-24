import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeActiveInjuries, describeMentionedInjury, describeUnloggedPainReport, injuryDirective } from './injury-context.ts';

test("a failed fetch is NEVER treated as 'no injuries' — Damion's release-blocker requirement", () => {
  const line = describeActiveInjuries(null, true);
  assert.ok(line, 'a failed fetch must still produce a directive, not silence');
  assert.match(line!, /NOT the same as having no injuries/i);
  assert.match(line!, /do not recommend exercise/i);
  assert.match(line!, /ask the user directly/i);
});

test('a failed fetch wins even if a stale empty array is passed alongside it', () => {
  const line = describeActiveInjuries([], true);
  assert.match(line!, /failed to load/i);
});

test('a genuinely empty, successful fetch produces no line at all', () => {
  assert.equal(describeActiveInjuries([], false), null);
  assert.equal(describeActiveInjuries(null, false), null);
});

test('a high-pain injury gates exercise guidance entirely', () => {
  const line = describeActiveInjuries(
    [{ area: 'SI joint', pain_level: 8, severity: 'severe', created_at: '2026-09-21T00:00:00Z' }],
    false,
  );
  assert.match(line!, /do not recommend exercise for any body part/i);
  assert.match(line!, /do not offer to swap/i);
  assert.match(line!, /never tell them a movement or session is "safe"/i);
  assert.match(line!, /qualified clinician/i);
});

test('a low-pain injury allows guidance but forbids "good to go" framing', () => {
  const line = describeActiveInjuries(
    [{ area: 'left wrist', pain_level: 2, severity: null, created_at: '2026-09-21T00:00:00Z' }],
    false,
  );
  assert.doesNotMatch(line!, /do not recommend exercise/i);
  assert.match(line!, /good to go/i);
});

test('flags pain mentioned in the current message so it is logged that turn', () => {
  assert.ok(describeUnloggedPainReport('my SI joint is hurting, about 8 out of 10'));
  assert.ok(describeUnloggedPainReport('I tweaked my shoulder yesterday'));
  assert.ok(describeUnloggedPainReport('lower back is really sore today'));
});

test('does not flag a denial of pain', () => {
  assert.equal(describeUnloggedPainReport('no pain at all today'), null);
  assert.equal(describeUnloggedPainReport('nothing hurts, feeling good'), null);
});

test('does not flag messages with no pain language', () => {
  assert.equal(describeUnloggedPainReport('commercial gym, four days a week'), null);
  assert.equal(describeUnloggedPainReport(''), null);
  assert.equal(describeUnloggedPainReport(null), null);
});

test('flags a bare pain rating with no pain word, so an improvement gets recorded', () => {
  assert.ok(describeUnloggedPainReport("it's down to about 3 out of 10 now, much better"));
  assert.ok(describeUnloggedPainReport('more like 8/10 today'));
});

test('only the most recent entry per area is surfaced, not superseded ones', () => {
  const out = describeActiveInjuries(
    [
      { area: 'si_joint', pain_level: 8, severity: null, created_at: '2026-09-23T10:00:00Z' },
      { area: 'si_joint', pain_level: 3, severity: null, created_at: '2026-09-24T10:00:00Z' },
    ],
    false,
  );
  assert.ok(out);
  assert.ok(out.includes('3/10'));
  assert.ok(!out.includes('8/10'));
});

test('separate areas are all kept', () => {
  const out = describeActiveInjuries(
    [
      { area: 'si_joint', pain_level: 3, severity: null, created_at: '2026-09-24T10:00:00Z' },
      { area: 'left_knee', pain_level: 5, severity: null, created_at: '2026-09-24T11:00:00Z' },
    ],
    false,
  );
  assert.ok(out);
  assert.ok(out.includes('si_joint'));
  assert.ok(out.includes('left_knee'));
});

test('the same area spelled differently is one injury, and only the latest counts', () => {
  const out = describeActiveInjuries(
    [
      { area: 'SI joint', pain_level: 8, severity: null, created_at: '2026-09-20T20:31:00Z' },
      { area: 'SI_joint', pain_level: 3, severity: null, created_at: '2026-09-24T10:00:00Z' },
    ],
    false,
  );
  assert.ok(out!.includes('3/10'));
  assert.ok(!out!.includes('8/10'));
});

test('left and right of the same joint stay separate injuries', () => {
  const out = describeActiveInjuries(
    [
      { area: 'left_knee', pain_level: 7, severity: null, created_at: '2026-09-20T10:00:00Z' },
      { area: 'right knee', pain_level: 2, severity: null, created_at: '2026-09-24T10:00:00Z' },
    ],
    false,
  );
  assert.ok(out!.includes('7/10'));
  assert.ok(out!.includes('2/10'));
});

const damionSi = [{ area: 'SI joint', pain_level: 8, severity: null, created_at: '2026-09-20T20:31:00Z' }];

test("Damion's stretch request names the 8/10 on file and gates guidance", () => {
  const line = describeMentionedInjury('I need to do some SI joint stretches before I work out.', damionSi);
  assert.ok(line);
  assert.match(line!, /8\/10/);
  assert.match(line!, /2026-09-20/);
  assert.match(line!, /take your time/i);
  assert.match(line!, /qualified clinician/i);
});

test('his follow-up asking for recommendations still triggers it', () => {
  assert.ok(describeMentionedInjury("You don't have nothing to recommend? Some stretches?", damionSi));
});

test('any spelling of the SI joint triggers it', () => {
  for (const text of ['S.i joint feels tight', 'my si-joint is acting up', 'sacroiliac is tight today']) {
    assert.ok(describeMentionedInjury(text, damionSi), text);
  }
});

test('a stretch or warm-up request triggers it even without naming the area', () => {
  assert.ok(describeMentionedInjury('I want to do some yoga before the gym', damionSi));
  assert.ok(describeMentionedInjury('what warm-up should I do?', damionSi));
});

test('an area the validator has no mapping for is still matched by its own words', () => {
  const finger = [{ area: 'finger', pain_level: 4, severity: null, created_at: '2026-09-19T21:46:00Z' }];
  assert.ok(describeMentionedInjury('my fingers are fine now', finger));
});

test('unrelated messages do not trigger it', () => {
  assert.equal(describeMentionedInjury('Thanks, sounds good', damionSi), null);
  assert.equal(describeMentionedInjury('what did I eat for lunch?', damionSi), null);
  assert.equal(describeMentionedInjury('I need stretches', []), null);
  assert.equal(describeMentionedInjury('I need stretches', null), null);
});

test('only injuries the message touches are listed', () => {
  const both = [...damionSi, { area: 'left_elbow', pain_level: 2, severity: null, created_at: '2026-09-18T10:00:00Z' }];
  const line = describeMentionedInjury('my elbow is sore after curls', both);
  assert.ok(line!.includes('left_elbow'));
  assert.ok(!line!.includes('SI joint'));
});

test('the directive record_injury returns matches the pain threshold', () => {
  assert.match(injuryDirective(8), /qualified clinician/i);
  assert.match(injuryDirective(6), /qualified clinician/i);
  assert.match(injuryDirective(3), /stop rule/i);
  assert.match(injuryDirective(null), /stop rule/i);
});

test('heading to the gym with a high-pain injury on file triggers the check', () => {
  assert.ok(describeMentionedInjury('Ok getting to the gym in 5 minutes', damionSi));
  assert.ok(describeMentionedInjury("What's today's workout?", damionSi));
});

test('heading to the gym with only a low-pain injury does not nag', () => {
  const mild = [{ area: 'SI joint', pain_level: 3, severity: null, created_at: '2026-09-24T10:00:00Z' }];
  assert.equal(describeMentionedInjury('Ok getting to the gym in 5 minutes', mild), null);
  assert.ok(describeMentionedInjury('I need to do some SI joint stretches before I work out.', mild));
});

test('a bare rating counts as a pain update when an injury is on file', () => {
  for (const text of [
    'Still about an 8',
    "Actually it's down to about a 3 today. What stretches can I do?",
    'it\u2019s a 5 today',
    'My si joint is about a 8',
    'now 2',
  ]) {
    assert.ok(describeUnloggedPainReport(text, true), text);
  }
});

test('a bare number is not a rating without an injury on file, or when it is reps, weight or time', () => {
  assert.equal(describeUnloggedPainReport('Still about an 8', false), null);
  for (const text of ['I did about 8 reps', 'maybe 3 sets', 'about 5 minutes', 'like 3 times a week', 'around 2 pm']) {
    assert.equal(describeUnloggedPainReport(text, true), null, text);
  }
});

test('the injury reminder carries the stretch format rule and the new-level instruction', () => {
  const line = describeMentionedInjury('I need to do some SI joint stretches before I work out.', damionSi);
  assert.match(line!, /hold time or rep count/i);
  assert.match(line!, /call record_injury with it first/i);
});

test('spoken ratings and "getting worse" count as a pain update over voice', () => {
  for (const text of [
    "Actually, it's getting worse. About an eight now.",
    "It's about a three.",
    'its flaring up again',
    'eight out of ten',
  ]) {
    assert.ok(describeUnloggedPainReport(text, true), text);
  }
  assert.equal(describeUnloggedPainReport('I did about eight reps', true), null);
  assert.equal(describeUnloggedPainReport('traffic is getting worse', false), null);
});
