import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripSystemNote, createSystemNoteFilter } from './strip-system-note.ts';

const ECHOED_NOTE =
  '[System note: A live session is now active. The live session state block will appear in the ' +
  'next user message. This is a live workout — use the balanced default shape: greet once at the ' +
  'start (you just did), confirm each completed set in one real line, announce when rest starts.]';

test('an echoed note is removed entirely', () => {
  assert.equal(stripSystemNote(ECHOED_NOTE), '');
});

test('a real greeting wrapped around an echoed note keeps the greeting', () => {
  assert.equal(
    stripSystemNote(`${ECHOED_NOTE} Overhead Press, six to eight reps. Let's go.`),
    "Overhead Press, six to eight reps. Let's go.",
  );
});

test('a note the model never closed is still removed', () => {
  assert.equal(stripSystemNote('Nice work. [System note: rest just ended and the set number'), 'Nice work.');
});

test('ordinary coaching text is untouched', () => {
  const reply = "Solid set. Rest is running, I'll tell you when it's up.";
  assert.equal(stripSystemNote(reply), reply);
});

test('square brackets that are not a system note survive', () => {
  assert.equal(stripSystemNote('Go with [the lighter pair] for this one.'), 'Go with [the lighter pair] for this one.');
});

const feedInChunks = (chunks: string[]): string => {
  const filter = createSystemNoteFilter();
  return chunks.map(filter).join('');
};

test('a note split across streamed chunks is never emitted', () => {
  assert.equal(feedInChunks(['[System ', 'note: greet the user ', 'briefly.] ', 'Overhead Press. Go.']), ' Overhead Press. Go.');
});

test('a bracket arriving at the very end of a chunk is held, not spoken', () => {
  assert.equal(feedInChunks(['Nice work. [', 'System note: stay quiet.]']), 'Nice work. ');
});

test('an unclosed note in a stream is never spoken', () => {
  assert.equal(feedInChunks(['Good. ', '[System note: rest just ', 'ended and the set']), 'Good. ');
});

test('streamed text with no note passes through unchanged', () => {
  const chunks = ['Solid set. ', "Rest is running, ", "I'll tell you when."];
  assert.equal(feedInChunks(chunks), chunks.join(''));
});

test('a real bracket in streamed text is still emitted', () => {
  assert.equal(feedInChunks(['Go with [the ', 'lighter pair].']), 'Go with [the lighter pair].');
});
