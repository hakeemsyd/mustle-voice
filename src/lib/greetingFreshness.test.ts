import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingIsFreshToday } from './greetingFreshness';

const at = (hour: number, day = 19): string => new Date(2026, 8, day, hour, 0, 0).toISOString();
const now = new Date(2026, 8, 19, 14, 0, 0);

const base = {
  greetingKey: 'session-a',
  mostRecentWorkoutAt: null,
  planCreatedAt: null,
  now,
};

test('a greeting written in the same time band today is reused', () => {
  assert.equal(
    greetingIsFreshToday({ ...base, lastGreeting: { at: at(13), greeting_key: 'session-a' } }),
    true,
  );
});

test('a morning greeting is not still valid in the afternoon', () => {
  assert.equal(
    greetingIsFreshToday({ ...base, lastGreeting: { at: at(7), greeting_key: 'session-a' } }),
    false,
  );
});

test('yesterday never counts, even at the same hour', () => {
  assert.equal(
    greetingIsFreshToday({ ...base, lastGreeting: { at: at(14, 18), greeting_key: 'session-a' } }),
    false,
  );
});

test("a greeting about a different session is stale — this is the swap case", () => {
  assert.equal(
    greetingIsFreshToday({ ...base, lastGreeting: { at: at(13), greeting_key: 'session-b' } }),
    false,
  );
});

test('a greeting with no key at all is treated as unverifiable', () => {
  assert.equal(
    greetingIsFreshToday({ ...base, lastGreeting: { at: at(13), greeting_key: null } }),
    false,
  );
});

test('a workout logged after the greeting invalidates it', () => {
  assert.equal(
    greetingIsFreshToday({
      ...base,
      lastGreeting: { at: at(13), greeting_key: 'session-a' },
      mostRecentWorkoutAt: at(13, 19).replace('T13', 'T13'),
    }),
    true,
  );
  assert.equal(
    greetingIsFreshToday({
      ...base,
      lastGreeting: { at: at(12), greeting_key: 'session-a' },
      mostRecentWorkoutAt: at(13),
    }),
    false,
  );
});

test('a plan created after the greeting invalidates it', () => {
  assert.equal(
    greetingIsFreshToday({
      ...base,
      lastGreeting: { at: at(12), greeting_key: 'session-a' },
      planCreatedAt: at(13),
    }),
    false,
  );
});

test('no stored greeting is never fresh', () => {
  assert.equal(greetingIsFreshToday({ ...base, lastGreeting: null }), false);
});
