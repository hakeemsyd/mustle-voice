import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConversationHistory } from './conversation-history.ts';

const AT = new Date('2026-09-26T10:00:00Z');

const fakeSupabase = (
  rpcResult: () => Promise<{ data: unknown; error: { message: string } | null }>,
  pinnedAt: string | null = null,
) => {
  const calls: { rpc: any[]; filters: [string, ...unknown[]][] } = { rpc: [], filters: [] };
  const messages: any = {
    select: (...args: unknown[]) => (calls.filters.push(['select', ...args]), messages),
    eq: (...args: unknown[]) => (calls.filters.push(['eq', ...args]), messages),
    gte: (...args: unknown[]) => (calls.filters.push(['gte', ...args]), messages),
    order: (...args: unknown[]) => (calls.filters.push(['order', ...args]), messages),
    limit: (...args: unknown[]) => {
      calls.filters.push(['limit', ...args]);
      return Promise.resolve({ data: [{ role: 'user', content: 'hi' }], error: null });
    },
  };
  const conversation: any = {
    select: () => conversation,
    eq: () => conversation,
    maybeSingle: () => Promise.resolve({ data: { pinned_at: pinnedAt }, error: null }),
  };
  return {
    calls,
    client: {
      rpc: (...args: any[]) => {
        calls.rpc.push(args);
        return rpcResult();
      },
      from: (table: string) => (table === 'conversation' ? conversation : messages),
    },
  };
};

const request = (client: any) => ({
  supabase: client,
  userId: 'user-1',
  at: AT,
  text: 'What should I eat?',
  columns: 'role,content',
  limit: 60,
  fallbackSince: '2026-09-26T00:00:00.000Z',
});

const usedTimeWindow = (filters: [string, ...unknown[]][]) =>
  filters.some(([op, col, val]) => op === 'gte' && col === 'at' && val === '2026-09-26T00:00:00.000Z') &&
  !filters.some(([op, col]) => op === 'eq' && col === 'conversation_id');

test('a conversation the user reopened is what the coach remembers', async () => {
  const { client, calls } = fakeSupabase(async () => ({ data: 'conv-1', error: null }), '2026-09-26T09:55:00Z');
  const history = await loadConversationHistory(request(client));
  assert.equal(history.scoped, true);
  assert.deepEqual(calls.rpc[0], [
    'conversation_resolve',
    { p_user: 'user-1', p_at: '2026-09-26T10:00:00.000Z', p_role: 'user', p_content: 'What should I eat?', p_create: false },
  ]);
  assert.ok(calls.filters.some(([op, col, val]) => op === 'eq' && col === 'conversation_id' && val === 'conv-1'));
  assert.ok(!calls.filters.some(([op]) => op === 'gte'));
});

test('without a reopened conversation the coach keeps the old time window', async () => {
  const { client, calls } = fakeSupabase(async () => ({ data: 'conv-1', error: null }), null);
  const history = await loadConversationHistory(request(client));
  assert.equal(history.scoped, false);
  assert.ok(usedTimeWindow(calls.filters));
});

test('an expired pin falls back to the old time window', async () => {
  const { client, calls } = fakeSupabase(async () => ({ data: 'conv-1', error: null }), '2026-09-26T09:00:00Z');
  const history = await loadConversationHistory(request(client));
  assert.equal(history.scoped, false);
  assert.ok(usedTimeWindow(calls.filters));
});

test('a message that would start a new conversation keeps the old time window', async () => {
  const { client, calls } = fakeSupabase(async () => ({ data: null, error: null }));
  const history = await loadConversationHistory(request(client));
  assert.equal(history.scoped, false);
  assert.ok(usedTimeWindow(calls.filters));
});

test('falls back to the time window when the lookup errors or throws', async () => {
  const errored = fakeSupabase(async () => ({ data: null, error: { message: 'boom' } }));
  assert.equal((await loadConversationHistory(request(errored.client))).scoped, false);
  assert.ok(usedTimeWindow(errored.calls.filters));

  const thrown = fakeSupabase(async () => {
    throw new Error('network');
  });
  assert.equal((await loadConversationHistory(request(thrown.client))).scoped, false);
  assert.ok(usedTimeWindow(thrown.calls.filters));
});

test("a reopened chat longer than the window still gives the coach the user's earlier words", async () => {
  const { describeEarlierInConversation } = await import('./conversation-history.ts');
  const filters: [string, ...unknown[]][] = [];
  const recent = Array.from({ length: 60 }, (_, i) => ({ role: 'user', content: `recent ${i}`, at: `2026-09-24T17:${String(59 - i).padStart(2, '0')}:00Z` }));
  let messageQueries = 0;
  const messages: any = {
    select: (...args: unknown[]) => (filters.push(['select', ...args]), messages),
    eq: (...args: unknown[]) => (filters.push(['eq', ...args]), messages),
    lt: (...args: unknown[]) => (filters.push(['lt', ...args]), messages),
    gte: (...args: unknown[]) => messages,
    order: () => messages,
    limit: () => {
      messageQueries += 1;
      return Promise.resolve(
        messageQueries === 1
          ? { data: recent, error: null }
          : {
              data: [
                { content: 'the whole pizza, log it as 3000 calories', at: '2026-09-23T21:34:00Z' },
                { content: '[[SYSTEM_CUE]] session_start', at: '2026-09-23T21:33:30Z' },
                { content: 'I just ate 3000 calories of pizza.', at: '2026-09-23T21:33:00Z' },
              ],
              error: null,
            },
      );
    },
  };
  const conversation: any = {
    select: () => conversation,
    eq: () => conversation,
    maybeSingle: () => Promise.resolve({ data: { pinned_at: '2026-09-26T09:55:00Z' }, error: null }),
  };
  const client = { rpc: async () => ({ data: 'conv-1', error: null }), from: (t: string) => (t === 'conversation' ? conversation : messages) };
  const history = await loadConversationHistory({ ...request(client), columns: 'role,content,at' });
  assert.deepEqual(
    history.earlier.map((m) => m.content),
    ['I just ate 3000 calories of pizza.', 'the whole pizza, log it as 3000 calories'],
  );
  assert.ok(filters.some(([op, col, val]) => op === 'lt' && col === 'at' && val === recent[59].at));
  const note = describeEarlierInConversation(history.earlier)!;
  assert.match(note, /- 2026-09-23: I just ate 3000 calories of pizza\./);
  assert.match(note, /Never say something was not mentioned/);
  assert.equal(describeEarlierInConversation([]), null);
});

test('a short or unscoped history loads nothing extra', async () => {
  const { client } = fakeSupabase(async () => ({ data: 'conv-1', error: null }), '2026-09-26T09:55:00Z');
  const history = await loadConversationHistory(request(client));
  assert.deepEqual(history.earlier, []);
});
