import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isStopCommand } from './stopCommand.ts';

test('a deliberate stop phrase ends the call, with or without fillers in front', () => {
  for (const line of [
    'Stop.',
    'stop talking',
    'Bye',
    'Goodbye.',
    'Bye bye',
    'Hang up.',
    'Be quiet',
    "That's all.",
    "That'll be all",
    'Okay, so that’s all. Bye',
    'Okay so that’s all',
    'Alright, bye.',
    'Well, goodbye',
    'Please stop',
    'That\u2019s all.',
    "That\u2019ll be all",
    'Okay so that\u2019s all',
  ]) {
    assert.equal(isStopCommand(line), true, line);
  }
});

test('mid-workout speech never ends the call by accident', () => {
  for (const line of [
    'Done.',
    'Done, eight reps.',
    'All right, done.',
    'Stop the rest.',
    'I need to stop for a second and get some water.',
    'Can you close the rest timer?',
    "That's all I had in the tank on that set.",
    'Bye week is coming up',
    'Quiet gym today.',
    'bye, actually wait, one more thing',
    'Okay. Start set three now.',
    'Six.',
    '',
  ]) {
    assert.equal(isStopCommand(line), false, line);
  }
});
