import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropSelfCorrection } from './humanize.ts';

test('drops an abandoned clause and keeps what the model settled on', () => {
  const out = dropSelfCorrection(
    "Since today's Wednesday, your first session is Upper Push on Monday — oh wait, that won't work today.",
  );
  assert.equal(out, "That won't work today.");
});

// Every case below is a sentence an earlier, looser version of this function truncated in
// production. "actually" and "wait" are ordinary words far more often than correction hinges, so
// they only count when a dash sets them off as an aside.
test('leaves "actually" used as an ordinary intensifier', () => {
  for (const input of [
    'I need to actually know a few things before I can build a safe plan.',
    'Let me actually check that for you first.',
    'Can you actually feel it in your lower back when you press?',
  ]) {
    assert.equal(dropSelfCorrection(input), input);
  }
});

test('leaves "wait" and "hold on" used literally', () => {
  for (const input of [
    'We should wait until Monday to start the next block.',
    'Wait 90 seconds between sets, then go again.',
    'Hold on to the rail if you feel unsteady during the set.',
  ]) {
    assert.equal(dropSelfCorrection(input), input);
  }
});

test('a sentence opening with a correction word is left alone', () => {
  const input = 'Actually that is the right weight for you.';
  assert.equal(dropSelfCorrection(input), input);
});

test('a short trailing aside is kept rather than truncating the sentence', () => {
  const input = 'Three sets of eight — actually four.';
  assert.equal(dropSelfCorrection(input), input);
});

test('an unambiguous phrase is stripped even after a comma', () => {
  const out = dropSelfCorrection('That is three sets, scratch that, it should be four sets today.');
  assert.equal(out, 'It should be four sets today.');
});

test('passes empty input through', () => {
  assert.equal(dropSelfCorrection(''), '');
});
