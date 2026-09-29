import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumeElapsedSec } from './sessionTime.ts';

const START = '2026-09-28T17:45:49Z';
const at = (minutes: number) => Date.parse(START) + minutes * 60_000;

test('coming back after an app kill counts the time away as workout time', () => {
  assert.equal(resumeElapsedSec(855, START, at(23)), 23 * 60, 'saved 14 min, back after 23 min of real time');
});

test('a long break before finishing later in the day is not counted', () => {
  assert.equal(resumeElapsedSec(855, START, at(180)), 855);
});

test('missing or odd inputs fall back to the saved time', () => {
  assert.equal(resumeElapsedSec(855, null, at(23)), 855);
  assert.equal(resumeElapsedSec(855, START, at(5)), 855, 'never less than what was saved');
  assert.equal(resumeElapsedSec(null, START, at(10)), 600);
});
