// Run: node --test supabase/functions/_shared/brain-orchestrator.test.ts
// Proves the loop's shape, especially the safety-critical one: a validator-rejected plan
// must never reach "persisted", and the model must get the rejection reason back so it can
// revise. This does not test real Claude behavior — callModel is scripted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBrainTurn, type CallModel } from './brain-orchestrator.ts';
import { validatePlan, explainViolations } from './injury-validator.ts';
import { findExercise } from './exercise-catalog.ts';

function scriptedModel(turns: any[]): CallModel {
  let i = 0;
  return async () => {
    if (i >= turns.length) throw new Error('scriptedModel ran out of turns');
    return turns[i++];
  };
}

const toolUse = (id: string, name: string, input: any) => ({
  stop_reason: 'tool_use' as const,
  content: [{ type: 'tool_use' as const, id, name, input }],
});

const endTurn = (text: string) => ({
  stop_reason: 'end_turn' as const,
  content: [{ type: 'text' as const, text }],
});

test('happy path: one safe tool call, then a reply', async () => {
  const persisted: any[] = [];
  const handlers = {
    log_checkin: async (input: any) => {
      persisted.push(input);
      return { status: 'ok' };
    },
  };

  const callModel = scriptedModel([
    toolUse('t1', 'log_checkin', { weight_kg: 82 }),
    endTurn('Logged — 82kg today.'),
  ]);

  const result = await runBrainTurn({ systemPrompt: 'sys', messages: [], handlers, callModel });

  assert.equal(result.reply, 'Logged — 82kg today.');
  assert.equal(result.toolCalls.length, 1);
  assert.equal(persisted.length, 1);
});

test('THE INVARIANT: a validator-rejected plan never persists — model must revise and resubmit', async () => {
  const persistedPlans: any[] = [];
  const activeInjuries = [{ area: 'left_knee', status: 'active' as const }];

  const handlers = {
    generate_training_plan: async (input: any) => {
      const exercisesForValidator = input.sessions.flatMap((s: any) =>
        s.exercises.map((e: any) => {
          const catalog = findExercise(e.name);
          return { name: e.name, contraindicatedFor: catalog?.contraindicatedFor ?? [] };
        }),
      );
      const violations = validatePlan(exercisesForValidator, activeInjuries);
      if (violations.length > 0) throw new Error(explainViolations(violations));

      persistedPlans.push(input);
      return { status: 'persisted' };
    },
  };

  const unsafePlan = {
    split: 'legs/upper',
    days_per_week: 3,
    sessions: [{ day_order: 1, focus: 'legs', exercises: [{ name: 'Back Squat', sets: 5, rep_scheme: '5' }] }],
  };
  const safePlan = {
    split: 'legs/upper',
    days_per_week: 3,
    sessions: [{ day_order: 1, focus: 'legs', exercises: [{ name: 'Hip Thrust', sets: 4, rep_scheme: '8-10' }] }],
  };

  const callModel = scriptedModel([
    toolUse('t1', 'generate_training_plan', unsafePlan),
    toolUse('t2', 'generate_training_plan', safePlan),
    endTurn('Built you a knee-safe plan.'),
  ]);

  const result = await runBrainTurn({ systemPrompt: 'sys', messages: [], handlers, callModel });

  assert.equal(persistedPlans.length, 1, 'exactly one plan should ever reach "persisted"');
  assert.equal(persistedPlans[0].sessions[0].exercises[0].name, 'Hip Thrust');

  assert.equal(result.toolCalls.length, 2);
  assert.ok(result.toolCalls[0].error, 'first (unsafe) attempt must be recorded as an error, not a result');
  assert.ok(result.toolCalls[0].error!.includes('Back Squat'));
  assert.ok(result.toolCalls[1].result, 'second (safe) attempt should succeed');
  assert.equal(result.reply, 'Built you a knee-safe plan.');
});

test('unknown tool name is reported back as an error, not thrown', async () => {
  const callModel = scriptedModel([toolUse('t1', 'delete_everything', {}), endTurn('ok')]);
  const result = await runBrainTurn({ systemPrompt: 'sys', messages: [], handlers: {}, callModel });

  assert.equal(result.toolCalls[0].error, 'unknown tool');
  assert.equal(result.reply, 'ok');
});

test('gives up gracefully if the model never stops calling tools', async () => {
  const handlers = { log_checkin: async () => ({ status: 'ok' }) };
  const turns = Array.from({ length: 20 }, (_, i) => toolUse(`t${i}`, 'log_checkin', {}));
  const callModel = scriptedModel(turns);

  const result = await runBrainTurn({ systemPrompt: 'sys', messages: [], handlers, callModel });

  assert.match(result.reply, /trouble finishing/i);
  assert.equal(result.toolCalls.length, 6, 'should stop at MAX_TOOL_ROUNDS, not loop forever');
});
