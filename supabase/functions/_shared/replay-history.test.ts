// Run: node --test supabase/functions/_shared/replay-history.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayHistory, type StoredMessage } from './replay-history.ts';

const userRow = (content: string): StoredMessage => ({ role: 'user', content });
const plainAssistant = (content: string): StoredMessage => ({ role: 'assistant', content, blocks: null });

const toolTurn = (reply: string, toolName: string, result: string): StoredMessage => ({
  role: 'assistant',
  content: reply,
  blocks: [
    { role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: toolName, input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: result }] },
    { role: 'assistant', content: [{ type: 'text', text: reply }] },
  ],
});

test('a plain text conversation replays unchanged', () => {
  const out = replayHistory([userRow('hi'), plainAssistant('hey')]);
  assert.deepEqual(out, [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hey' },
  ]);
});

test('THE BUG: a tool turn replays its tool_use and tool_result, not just the reply text', () => {
  const out = replayHistory([userRow('I ate chicken and rice'), toolTurn('Logged.', 'log_food', '{"status":"logged"}')]);

  const flat = JSON.stringify(out);
  assert.ok(flat.includes('tool_use'), 'tool_use block must survive into the replayed history');
  assert.ok(flat.includes('log_food'), 'the tool name must be visible to the model');
  assert.ok(flat.includes('tool_result'), 'tool_result must survive so the call reads as completed');
});

test('every tool_use has a matching tool_result in the replayed history', () => {
  const out = replayHistory([userRow('log it'), toolTurn('Done.', 'log_checkin', '{"status":"logged"}')]);

  const useIds = new Set<string>();
  const resultIds = new Set<string>();
  for (const entry of out) {
    if (!Array.isArray(entry.content)) continue;
    for (const block of entry.content) {
      if (block.type === 'tool_use') useIds.add(block.id);
      if (block.type === 'tool_result') resultIds.add(block.tool_use_id);
    }
  }
  assert.deepEqual([...useIds], [...resultIds]);
});

test('history always opens on a real user turn', () => {
  const out = replayHistory([toolTurn('Done.', 'log_food', '{}'), userRow('thanks'), plainAssistant('anytime')]);
  assert.equal(out[0].role, 'user');
  assert.equal(out[0].content, 'thanks');
});

test('a window starting mid-tool-turn never leaves an orphaned tool_result', () => {
  const orphan: StoredMessage = {
    role: 'assistant',
    content: 'Done.',
    blocks: [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_9', content: 'ok' }] }],
  };
  const out = replayHistory([orphan, userRow('next question')]);
  assert.equal(out.length, 1);
  assert.equal(out[0].content, 'next question');
});

test('oversized read_state results are capped, mutation results are left intact', () => {
  const huge = 'x'.repeat(9000);
  const out = replayHistory([userRow('what is my plan'), toolTurn('Here it is.', 'read_state', huge)]);

  const results = out.flatMap((e: any) => (Array.isArray(e.content) ? e.content : [])).filter((b: any) => b.type === 'tool_result');
  assert.equal(results.length, 1);
  assert.ok(results[0].content.length < 9000, 'huge payload must be truncated');
  assert.ok(results[0].content.endsWith('… [truncated]'));

  const small = replayHistory([userRow('log it'), toolTurn('Logged.', 'log_food', '{"status":"logged"}')]);
  const smallResult = small
    .flatMap((e: any) => (Array.isArray(e.content) ? e.content : []))
    .find((b: any) => b.type === 'tool_result');
  assert.equal(smallResult.content, '{"status":"logged"}');
});

test('empty and whitespace-only rows are dropped (the model rejects empty content)', () => {
  const out = replayHistory([userRow('hi'), { role: 'assistant', content: '   ', blocks: null }, userRow('still there')]);
  assert.deepEqual(out, [
    { role: 'user', content: 'hi' },
    { role: 'user', content: 'still there' },
  ]);
});

test('rows written before the blocks column existed still replay as plain text', () => {
  const legacy = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hey' }] as StoredMessage[];
  assert.deepEqual(replayHistory(legacy), [
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hey' },
  ]);
});

test('a multi-round tool turn replays all rounds in order', () => {
  const twoRounds: StoredMessage = {
    role: 'assistant',
    content: 'Plan updated.',
    blocks: [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'update_training_plan', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'rejected: knee', is_error: true }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'update_training_plan', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'b', content: '{"status":"persisted"}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Plan updated.' }] },
    ],
  };
  const out = replayHistory([userRow('my knee hurts'), twoRounds]);
  assert.equal(out.length, 6);
  assert.ok(JSON.stringify(out).includes('rejected: knee'), 'the validator rejection stays visible');
});
