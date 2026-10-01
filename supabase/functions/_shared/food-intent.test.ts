import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeFoodTurn, offTopicTurnNote } from './food-intent.ts';
import { classifySpokenSet, SET_PARSER_VERSION } from './set-report.ts';

const isSet = (line: string): boolean =>
  classifySpokenSet(line, 'imperial', {
    typed: true,
    resting: false,
    version: SET_PARSER_VERSION,
    confirmsBareReps: true,
    timedExercise: false,
    awaitingDetails: false,
  }).kind !== 'ignore';

test('a meal mentioned mid-workout is recognised as a food turn', () => {
  for (const line of [
    'I had two eggs and a slice of toast for breakfast',
    'I also had a banana',
    'I ate a chicken salad',
    'just drank a protein shake',
    'had a snack between sets',
    'what are my macros looking like',
    'how many calories do I have left',
    'I had my lunch already',
  ]) {
    assert.equal(looksLikeFoodTurn(line), true, line);
  }
});

test('workout speech is never mistaken for a food turn', () => {
  for (const line of [
    'Done 10 reps',
    'I had 8 reps on that one',
    'Okay. Start set three now.',
    'Six.',
    'At the end of the next set, I’m gonna go to 80 pound.',
    'I remember I asked for 80 pounds, you still said 70.',
    'Make it 90 seconds rest',
    'skip',
    'yes',
    '',
  ]) {
    assert.equal(looksLikeFoodTurn(line), false, line);
  }
});

test('the food note only ever applies to turns the set parser already ignored', () => {
  for (const line of [
    'I had two eggs and a slice of toast for breakfast',
    'I also had a banana',
    'just drank a protein shake',
  ]) {
    assert.equal(isSet(line), false, `${line} must not read as a set`);
    assert.equal(looksLikeFoodTurn(line), true, line);
  }
});

test('the off-topic note always says nothing was logged, and only mentions food when it is food', () => {
  assert.match(offTopicTurnNote(false), /NOT a set report/);
  assert.doesNotMatch(offTopicTurnNote(false), /FOOD/);
  assert.match(offTopicTurnNote(true), /FOOD/);
  assert.match(offTopicTurnNote(true), /food tool/);
});
