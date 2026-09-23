import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksRecoverable, worthRecovering } from './recoverableError';

test('the supabase-js abort message is treated as recoverable', () => {
  assert.equal(looksRecoverable('Failed to send a request to the Edge Function'), true);
});

test('the other shapes a dropped request arrives in are recoverable too', () => {
  for (const message of [
    'Network request failed',
    'The request timed out',
    'timeout of 25000ms exceeded',
    'The operation was aborted',
    'Load failed',
  ]) {
    assert.equal(looksRecoverable(message), true, message);
  }
});

test('a real server error is NOT recovered from — the reply never existed', () => {
  for (const message of [
    'userId and message are required',
    'brain: anthropic 500',
    'JWT expired',
    'row-level security policy violation',
  ]) {
    assert.equal(looksRecoverable(message), false, message);
  }
});

const httpError = (status: number) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: { status },
});

test('a 5xx is recovered from — the turn may have been processed before the response died', () => {
  for (const status of [500, 502, 503, 504, 546]) {
    assert.equal(worthRecovering(httpError(status)), true, String(status));
  }
});

test('overload and request-timeout statuses are recovered from too', () => {
  assert.equal(worthRecovering(httpError(408)), true);
  assert.equal(worthRecovering(httpError(429)), true);
});

test('a 4xx is NOT waited on — the request never reached the model', () => {
  for (const status of [400, 401, 403, 404]) {
    assert.equal(worthRecovering(httpError(status)), false, String(status));
  }
});

test('with no status attached it falls back to reading the message', () => {
  assert.equal(worthRecovering({ message: 'Network request failed' }), true);
  assert.equal(worthRecovering({ message: 'row-level security policy violation' }), false);
});
