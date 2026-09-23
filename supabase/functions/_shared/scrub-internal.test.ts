import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrubInternalLanguage, looksInternal } from './scrub-internal.ts';

test('the leaks Damion actually reported are dropped', () => {
  assert.equal(
    scrubInternalLanguage(
      "Nice work. I don't have a live session state block showing what was just logged. Keep going.",
    ),
    'Nice work. Keep going.',
  );
  assert.equal(
    scrubInternalLanguage('Good set. My swap tool can only move to the next queued exercise. Try the app.'),
    'Good set. Try the app.',
  );
});

test('tool and table names never reach the user', () => {
  assert.equal(looksInternal('I called log_live_set for you.'), true);
  assert.equal(looksInternal('That is in your workout_log already.'), true);
  assert.equal(looksInternal('I will use open_todays_workout.'), true);
  assert.equal(
    scrubInternalLanguage('Logged it. The row went into workout_log. Rest up.'),
    'Logged it. Rest up.',
  );
});

test('ordinary coaching language is untouched', () => {
  const replies = [
    "You're on Push-up, set two of four, and rest is running.",
    'Nice work — 75 pounds for 8 reps. Rest is on, 90 seconds.',
    'Take the first set easy and see how many clean reps you get.',
    'How did that feel? Any shoulder pain?',
    'Your last session was Upper Push on Thursday.',
  ];
  for (const reply of replies) assert.equal(scrubInternalLanguage(reply), reply, reply);
});

test('a reply that is entirely internal is passed through rather than emptied', () => {
  const allMeta = 'I have no live session state. My tool call failed.';
  assert.equal(scrubInternalLanguage(allMeta), allMeta);
});

test('empty and whitespace input is returned as-is', () => {
  assert.equal(scrubInternalLanguage(''), '');
  assert.equal(scrubInternalLanguage('   '), '   ');
});

test('a single clean sentence survives', () => {
  assert.equal(scrubInternalLanguage('Rest is on.'), 'Rest is on.');
});
