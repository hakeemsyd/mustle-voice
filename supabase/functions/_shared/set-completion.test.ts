import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasSetCompletionSignal, userClaimedSetFinished } from './set-completion.ts';

const stubSupabase = (rows: { content: string }[]) => ({
  from: () => ({
    select: () => ({
      eq: function () {
        return this;
      },
      gte: function () {
        return this;
      },
      order: function () {
        return this;
      },
      limit: () => Promise.resolve({ data: rows, error: null }),
    }),
  }),
});

test('counting out loud is never a completion signal', () => {
  for (const text of ['One, two, three.', 'Four, five.', 'Six.', '7, 8', 'All right. One.']) {
    assert.equal(hasSetCompletionSignal(text), false, text);
  }
});

test('a real completion claim is recognised', () => {
  for (const text of ['Set one done.', 'Finished.', "That's it.", 'Set complete, 8 reps.', 'Racked it.']) {
    assert.equal(hasSetCompletionSignal(text), true, text);
  }
});

test('an infinitive "to complete" describing an unrelated task is never a completion signal', () => {
  for (const text of [
    'you have to complete 30 in 30 seconds',
    'I need to complete this count first',
    "let's complete the set",
  ]) {
    assert.equal(hasSetCompletionSignal(text), false, text);
  }
});

test("Hakeem's exact live incident: a stray infinitive doesn't open the window for a later bare weight to fabricate a set", async () => {
  const history = [
    { content: 'You are counting from one to 30 in 30 seconds.' },
    { content: 'No. Can you do, like, slow? I just... Uh, you have to complete 30 in 30 seconds.' },
    { content: 'Can you count from one to 30 for me?' },
  ];
  assert.equal(await userClaimedSetFinished(stubSupabase(history), 'u1', '80 kg.'), false);
});

test("the coach cannot log a set from Damion's counting sequence", async () => {
  const counting = [
    { content: 'Four, five.' },
    { content: 'Four.' },
    { content: 'All right. One, two, three.' },
    { content: 'All right. One.' },
    { content: 'I need you to follow along as I work out.' },
  ];
  assert.equal(await userClaimedSetFinished(stubSupabase(counting), 'u1', 'Six.'), false);
});

test('the current turn alone is enough, before it reaches the message table', async () => {
  assert.equal(await userClaimedSetFinished(stubSupabase([]), 'u1', 'Set two done, 8 reps.'), true);
});

test('a completion a few turns back still counts, so answering "how many?" logs', async () => {
  const history = [
    { content: 'Eight.' },
    { content: 'Set one done.' },
    { content: "Let's go." },
  ];
  assert.equal(await userClaimedSetFinished(stubSupabase(history), 'u1', '8 reps'), true);
});

test('no history and no signal means no log', async () => {
  assert.equal(await userClaimedSetFinished(stubSupabase([]), 'u1', '8 reps'), false);
  assert.equal(await userClaimedSetFinished(stubSupabase([]), 'u1', null), false);
});

test("Damion's planned rep count is never loggable, even right after a real 'done'", async () => {
  const history = [{ content: 'Set one done, 10 reps.' }];
  assert.equal(await userClaimedSetFinished(stubSupabase(history), 'u1', "I'll do about 10 reps"), false);
  assert.equal(await userClaimedSetFinished(stubSupabase([]), 'u1', "I'll do about 10 reps"), false);
});

test('a finished set said without the word done passes the gate', async () => {
  assert.equal(await userClaimedSetFinished(stubSupabase([]), 'u1', 'I just did 10 push-ups.'), true);
  assert.equal(await userClaimedSetFinished(stubSupabase([]), 'u1', 'I just told you, I just did ten.'), true);
});
