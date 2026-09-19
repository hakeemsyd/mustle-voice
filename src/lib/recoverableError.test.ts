import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksRecoverable } from './recoverableError';

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
