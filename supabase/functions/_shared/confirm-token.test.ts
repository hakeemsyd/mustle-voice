import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueConfirmToken, verifyConfirmToken } from './confirm-token.ts';

const SECRET = 'test-secret-does-not-need-to-be-realistic';

// This is the actual security property the token exists for: closing the gap where a model
// calls a mutating tool with confirm:true on its very first turn (a misheard "yes" with no real
// preview behind it) — confirmed live as the cause of an unrequested workout session starting.
test('a fabricated token never verifies', async () => {
  const ok = await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-1', 'not-a-real-token');
  assert.ok(!ok);
});

test('missing token never verifies', async () => {
  assert.ok(!await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-1', undefined));
  assert.ok(!await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-1', null));
});

test('a genuinely issued token verifies against the same tool and key', async () => {
  const token = await issueConfirmToken(SECRET, 'start_todays_workout', 'session-1');
  assert.ok(await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-1', token));
});

test('a token does not verify for a different session id', async () => {
  const token = await issueConfirmToken(SECRET, 'start_todays_workout', 'session-1');
  // The scenario this defends: the state changes between preview and confirm (a different
  // session becomes today's due session), and the model still holds yesterday's token.
  assert.ok(!await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-2', token));
});

test('a token does not verify for a different tool', async () => {
  const token = await issueConfirmToken(SECRET, 'delete_food', 'food-row-1');
  // Confirms tokens aren't reusable across tools even when the key string happens to collide.
  assert.ok(!await verifyConfirmToken(SECRET, 'update_food', 'food-row-1', token));
});

test('a token for different proposed values does not verify', async () => {
  // update_food/log_workout key on a hash of the exact proposed fields — so a token issued for
  // one preview must not validate a confirm call carrying different values than what was shown.
  const token = await issueConfirmToken(SECRET, 'update_food', 'id-1:{"calories":400}');
  assert.ok(!await verifyConfirmToken(SECRET, 'update_food', 'id-1:{"calories":900}', token));
});

test('an expired token does not verify', async () => {
  // Simulates the TTL boundary directly rather than sleeping in a test — builds an
  // already-expired token by hand using the same signing scheme.
  const pastExpiry = Date.now() - 1000;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`start_todays_workout:session-1:${pastExpiry}`));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const expiredToken = `${pastExpiry}.${hex}`;

  assert.ok(!await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-1', expiredToken));
});

test('a token signed with a different secret does not verify', async () => {
  const token = await issueConfirmToken('a-different-secret', 'start_todays_workout', 'session-1');
  assert.ok(!await verifyConfirmToken(SECRET, 'start_todays_workout', 'session-1', token));
});
