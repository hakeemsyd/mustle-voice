import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTitleTranscript,
  generateConversationTitle,
  parseTitleResponse,
  sanitizeTags,
  sanitizeTitle,
  TITLE_TOOL,
} from './conversation-title.ts';

(globalThis as any).Deno ??= { env: { get: () => 'test-secret' } };

test('transcript labels speakers, drops cues and empty rows', () => {
  const transcript = buildTitleTranscript([
    { role: 'user', content: '[[SYSTEM_CUE]] session_start' },
    { role: 'user', content: 'I want to change the workout' },
    { role: 'assistant', content: '' },
    { role: 'assistant', content: 'What would you like instead?' },
    { role: 'assistant', content: 'Logged 25 lb x 8 reps', modality: 'app' },
  ]);
  assert.equal(
    transcript,
    'User: I want to change the workout\nCoach: What would you like instead?\nApp: Logged 25 lb x 8 reps',
  );
});

test('long conversations keep the opening and the latest messages', () => {
  const messages = Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `message ${i}` }));
  const lines = buildTitleTranscript(messages).split('\n');
  assert.equal(lines[0], 'User: message 0');
  assert.equal(lines[10], '…');
  assert.equal(lines.at(-1), 'Coach: message 79');
  assert.equal(lines.length, 61);
});

test('long messages are clipped and the transcript stays under budget', () => {
  const messages = Array.from({ length: 60 }, () => ({ role: 'user', content: 'x'.repeat(1000) }));
  const transcript = buildTitleTranscript(messages);
  assert.ok(transcript.length <= 9000);
  assert.ok(transcript.split('\n')[0].endsWith('…'));
});

test('titles are cleaned to the house style', () => {
  assert.equal(sanitizeTitle('"Swapped legs for shoulders."'), 'Swapped legs for shoulders');
  assert.equal(sanitizeTitle('knee pain — hamstring stretch'), 'Knee pain hamstring stretch');
  assert.equal(sanitizeTitle('Today’s workout swap'), "Today's workout swap");
  assert.equal(sanitizeTitle("'Logged lunch'"), 'Logged lunch');
  assert.equal(sanitizeTitle('Conversation'), null);
  assert.equal(sanitizeTitle('   '), null);
  assert.equal(sanitizeTitle(42), null);
  assert.ok(sanitizeTitle('a'.repeat(100))!.length <= 60);
});

test('tags keep only known topics, drop general, dedupe', () => {
  assert.deepEqual(sanitizeTags(['workout', 'meal', 'workout', 'general', 'cardio']), ['meal', 'workout']);
  assert.deepEqual(sanitizeTags(['general']), []);
  assert.deepEqual(sanitizeTags('meal'), []);
});

test('parses the forced tool call and ignores anything else', () => {
  assert.deepEqual(
    parseTitleResponse([
      { type: 'text', text: 'Sure' },
      { type: 'tool_use', name: TITLE_TOOL.name, input: { title: 'Knee pain and stretching', tags: ['recovery'] } },
    ]),
    { title: 'Knee pain and stretching', tags: ['recovery'] },
  );
  assert.equal(parseTitleResponse([{ type: 'text', text: 'Knee pain' }]), null);
  assert.equal(parseTitleResponse(null), null);
});

test('generateConversationTitle forces the tool and returns the parsed title', async () => {
  let sent: any = null;
  const fakeFetch = (async (_url: string, init: any) => {
    sent = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ content: [{ type: 'tool_use', name: TITLE_TOOL.name, input: { title: 'Logged lunch', tags: ['meal'] } }] }),
      { status: 200 },
    );
  }) as typeof fetch;
  const named = await generateConversationTitle([{ role: 'user', content: 'I had chicken and rice for lunch' }], fakeFetch);
  assert.deepEqual(named, { title: 'Logged lunch', tags: ['meal'] });
  assert.deepEqual(sent.tool_choice, { type: 'tool', name: TITLE_TOOL.name });
  assert.match(sent.messages[0].content, /User: I had chicken and rice for lunch/);
});

test('generateConversationTitle skips the model when there is nothing to name', async () => {
  let called = false;
  const fakeFetch = (async () => {
    called = true;
    return new Response('{}');
  }) as typeof fetch;
  assert.equal(await generateConversationTitle([{ role: 'user', content: '[[SYSTEM_CUE]] rest_over' }], fakeFetch), null);
  assert.equal(called, false);
});
