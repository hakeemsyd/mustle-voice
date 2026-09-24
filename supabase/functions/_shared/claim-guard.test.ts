import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guardClaims, isUnbackedClaim, claimFallback, INJURY_FALLBACK, type ClaimGuardState } from './claim-guard.ts';

const withInjury: ClaimGuardState = {
  liveSession: false,
  setLoggedThisTurn: false,
  restActive: false,
  actionSucceededThisTurn: false,
  injuryOnFile: true,
};
const noInjury: ClaimGuardState = { ...withInjury, injuryOnFile: false };

test('clearance lines from the live SI-joint test are dropped when an injury is on file', () => {
  for (const line of [
    "You're good to head to the gym.",
    'Lower is up today with Leg Press, Leg Extension, Leg Curl, and Glute Bridge — all safe for your SI joint at a 3.',
    'You already did those — Figure-4 stretch 30 seconds each side.',
    'You just did them.',
    'Light stretching is fine at a 3, but ease into it and stop if it flares up.',
    'Those should loosen the area safely.',
    'Upper Push or Upper Pull are both safe — nothing there stresses the SI joint.',
    "Hit those and you're good to go.",
  ]) {
    assert.ok(isUnbackedClaim(line, withInjury), line);
  }
});

test('cautions and conditionals are kept', () => {
  for (const line of [
    "Hold up — with your SI joint at an 8, training isn't safe right now.",
    "That's not safe for your SI joint today.",
    "You're not good to go until it settles.",
    'Once a clinician has cleared you to train, we can build back up.',
    'Figure-4 stretch: lie on your back, hold 30 seconds, stop if you feel sharp pain.',
    'Get it assessed by a qualified clinician before training.',
  ]) {
    assert.ok(!isUnbackedClaim(line, withInjury), line);
  }
});

test('clearance wording is left alone when no injury is on file', () => {
  assert.ok(!isUnbackedClaim("You're good to go.", noInjury));
});

test('a reply that is all clearance falls back to asking how it feels', () => {
  const { text, dropped } = guardClaims("You're good to head to the gym. It's all safe for your SI joint.", withInjury);
  assert.equal(text, '');
  assert.equal(dropped.length, 2);
  assert.equal(claimFallback(false, false, true), INJURY_FALLBACK);
});
