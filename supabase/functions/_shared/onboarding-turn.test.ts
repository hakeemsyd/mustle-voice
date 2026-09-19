import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOnboardingSetupTurn } from './onboarding-turn.ts';

const ONBOARDING_MESSAGE =
  'I just finished onboarding — please set up my training plan and nutrition targets from what ' +
  'you know about me, and briefly explain why you chose this split and these targets.';

test("onboarding's own plan-setup turn is recognized", () => {
  assert.equal(isOnboardingSetupTurn(ONBOARDING_MESSAGE, true, false), true);
});

test('the daily greeting is hidden too, and must never lift the confirm gate', () => {
  assert.equal(isOnboardingSetupTurn(ONBOARDING_MESSAGE, true, true), false);
});

test('a user cannot reach it by typing the same words in chat', () => {
  assert.equal(isOnboardingSetupTurn(ONBOARDING_MESSAGE, false, false), false);
  assert.equal(isOnboardingSetupTurn('I just finished onboarding, build me a plan', false, false), false);
});

test('an ordinary hidden turn is not a plan-setup turn', () => {
  assert.equal(isOnboardingSetupTurn('Say hello for the first time today', true, false), false);
});

test('a missing or non-string message never matches', () => {
  assert.equal(isOnboardingSetupTurn(undefined, true, false), false);
  assert.equal(isOnboardingSetupTurn(null, true, false), false);
  assert.equal(isOnboardingSetupTurn(42, true, false), false);
});
