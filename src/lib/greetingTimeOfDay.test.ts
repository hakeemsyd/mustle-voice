import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignGreetingToTimeBand } from './greetingTimeOfDay';

test("Hakeem's midnight greeting: 'Morning' at night becomes a neutral hello", () => {
  assert.equal(
    alignGreetingToTimeBand('Morning, Hakeem — Lower day today.', 'Night'),
    'Hey, Hakeem — Lower day today.',
  );
  assert.equal(alignGreetingToTimeBand('Good evening Hakeem!', 'Night'), 'Hey Hakeem!');
});

test('a wrong time of day is corrected to the one the header shows', () => {
  assert.equal(alignGreetingToTimeBand('Good morning, Hakeem.', 'Evening'), 'Good evening, Hakeem.');
  assert.equal(alignGreetingToTimeBand('Afternoon, Hakeem.', 'Morning'), 'Morning, Hakeem.');
});

test('a matching or time-free greeting is left alone', () => {
  assert.equal(alignGreetingToTimeBand('Morning, Hakeem.', 'Morning'), 'Morning, Hakeem.');
  assert.equal(alignGreetingToTimeBand('Lower day today, Hakeem.', 'Night'), 'Lower day today, Hakeem.');
});
