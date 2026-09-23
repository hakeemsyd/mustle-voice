import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeActiveInjuries, describeUnloggedPainReport } from './injury-context.ts';

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
  assert.match(line!, /do not recommend exercise/i);
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
