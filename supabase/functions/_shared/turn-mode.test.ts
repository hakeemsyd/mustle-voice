import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAIN_TOOLS, LIVE_SESSION_TOOLS, NO_SESSION_TOOLS, toolsForMode } from './brain-tools.ts';
import { NO_LIVE_SESSION_NOTE, resolveTurnMode } from './live-session-format.ts';

(globalThis as any).Deno ??= { env: { get: () => '' } };

const config = await import('./brain-config.ts');
const { buildStaticSystemPrompt, SYSTEM_PROMPT } = config;

const live = () => buildStaticSystemPrompt(true, 'text', false, 'live');
const chat = () => buildStaticSystemPrompt(true, 'text', false, 'default');

const LIVE_BLOCK_TRAINING =
  'LIVE WORKOUT STATE\n- Status: training\n- Current exercise: Incline Dumbbell Press (2 of 5)';
const LIVE_BLOCK_RESTING = 'LIVE WORKOUT STATE\n- Status: resting\n- Current exercise: Leg Curl (1 of 4)';
const LIVE_BLOCK_FINISHED = 'LIVE WORKOUT STATE\n- Status: finished\n- Current exercise: Leg Curl (4 of 4)';

test('a running workout puts the turn in live mode, a finished or absent one does not', () => {
  assert.equal(resolveTurnMode(LIVE_BLOCK_TRAINING), 'live');
  assert.equal(resolveTurnMode(LIVE_BLOCK_RESTING), 'live');
  assert.equal(resolveTurnMode('LIVE WORKOUT STATE\n- Status: paused.'), 'live');
  assert.equal(resolveTurnMode(LIVE_BLOCK_FINISHED), 'default');
  assert.equal(resolveTurnMode(NO_LIVE_SESSION_NOTE), 'default');
  assert.equal(resolveTurnMode(''), 'default');
  assert.equal(resolveTurnMode(null), 'default');
  assert.equal(resolveTurnMode(undefined), 'default');
});

test('no rule text is lost by splitting the prompt into modes', () => {
  const union = new Set([...live().split('\n'), ...chat().split('\n')]);
  const missing = SYSTEM_PROMPT.split('\n').filter((line: string) => line.trim() && !union.has(line));
  assert.deepEqual(missing, [], 'every line of the prompt must survive in at least one mode');
});

test('each mode is materially smaller than the prompt that shipped as one block', () => {
  assert.ok(live().length < SYSTEM_PROMPT.length * 0.85, `live mode is ${live().length} chars`);
  assert.ok(chat().length < SYSTEM_PROMPT.length * 0.85, `default mode is ${chat().length} chars`);
});

test('outside a workout the model is never handed live-workout conduct — the bias behind "why the workout questions in a new chat"', () => {
  const text = chat();
  for (const phrase of [
    'SILENCE IS PART OF COACHING',
    'NEVER RUN A TEMPLATE',
    'WHAT THE APP ALWAYS DOES',
    'ONLY THE APP LOGS SETS',
    'A user reporting a completed set ALWAYS starts a rest timer',
    'swap_exercise only works on an exercise that hasn',
    'THE BALANCED DEFAULT FOR A LIVE WORKOUT',
  ]) {
    assert.ok(!text.includes(phrase), `default mode must not carry live-workout rule: ${phrase}`);
  }
  assert.ok(text.includes('A plan having a session scheduled for today does not mean a workout is in progress.'));
});

test('during a workout the model is never handed plan-building or import rules', () => {
  const text = live();
  for (const phrase of [
    'only accept exercises from this exact catalog',
    "LIFTERS' SHORTHAND",
    'YOUR FIRST ACTION IS create_custom_session',
    'The SHAPE of the week is checked in code',
    'use reschedule_today',
  ]) {
    assert.ok(!text.includes(phrase), `live mode must not carry planning rule: ${phrase}`);
  }
});

test('safety, food and reply-shape rules are never gated away — they hold in both modes', () => {
  for (const [name, text] of [
    ['live', live()],
    ['default', chat()],
  ] as const) {
    assert.ok(
      text.includes('When someone mentions pain or a possible injury for the FIRST time'),
      `${name} mode lost the injury gate`,
    );
    assert.ok(
      text.includes('NEVER change the plan off the back of a pain mention'),
      `${name} mode lost the pain-mention gate`,
    );
    assert.ok(text.includes('DO NOT LOG FOOD UNTIL THE MEAL IS FULLY DESCRIBED'), `${name} mode lost the food rules`);
    assert.ok(text.includes('FUTURE INTENT IS NOT CONSUMPTION'), `${name} mode lost the future-meal rule`);
    assert.ok(text.includes('Never use markdown'), `${name} mode lost the formatting rule`);
    assert.ok(text.includes('Keep replies to 1-2 short sentences'), `${name} mode lost the reply-length rule`);
    assert.ok(
      text.includes('IF THE USER SAYS THEY DID NOT SAY SOMETHING, THEY DID NOT SAY IT'),
      `${name} mode lost the misheard-speech rule`,
    );
    assert.ok(
      text.includes('A DIRECT REQUEST OUTRANKS ANY QUESTION YOU ARE STILL WAITING ON'),
      `${name} mode lost the direct-request rule`,
    );
  }
});

test('outside a workout the live-session tools are not even offered, so the coach cannot reach for one', () => {
  const names = toolsForMode(BRAIN_TOOLS, 'default').map((t) => t.name);
  for (const gated of LIVE_SESSION_TOOLS) assert.ok(!names.includes(gated as any), `${gated} must be gated off`);
  assert.ok(names.includes('log_food' as any));
  assert.ok(names.includes('start_todays_workout' as any));
  assert.ok(names.includes('resolve_interrupted_workout' as any));
});

test('during a workout the tools that only make sense outside one are not offered', () => {
  const names = toolsForMode(BRAIN_TOOLS, 'live').map((t) => t.name);
  for (const gated of NO_SESSION_TOOLS) assert.ok(!names.includes(gated as any), `${gated} must be gated off`);
  assert.ok(names.includes('undo_last_set' as any));
  assert.ok(names.includes('go_to_exercise' as any));
  assert.ok(names.includes('log_food' as any), 'logging a meal mid-workout is a reported flow, it must survive');
  assert.ok(names.includes('record_injury' as any), 'pain reported mid-set must still be recordable');
});

test('every tool is still reachable in at least one mode', () => {
  const reachable = new Set([
    ...toolsForMode(BRAIN_TOOLS, 'live').map((t) => t.name),
    ...toolsForMode(BRAIN_TOOLS, 'default').map((t) => t.name),
  ]);
  const lost = BRAIN_TOOLS.filter((t) => !reachable.has(t.name)).map((t) => t.name);
  assert.deepEqual(lost, []);
});

test('no tool is gated in both directions at once', () => {
  const both = [...LIVE_SESSION_TOOLS].filter((name) => NO_SESSION_TOOLS.has(name));
  assert.deepEqual(both, []);
});

test('gated tool names all exist — a typo would silently gate nothing', () => {
  const known = new Set(BRAIN_TOOLS.map((t) => t.name as string));
  for (const name of [...LIVE_SESSION_TOOLS, ...NO_SESSION_TOOLS]) {
    assert.ok(known.has(name), `${name} is not a real tool`);
  }
});
