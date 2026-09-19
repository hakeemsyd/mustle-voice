import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verbalizeUnitsForSpeech } from './verbalize-for-speech.ts';

// Every case Damion reported hearing wrong, kept as a regression net — this layer is the only
// thing standing between a model that writes "0.5%" and TTS reading it as "U point five".
test('expands unit abbreviations', () => {
  assert.equal(verbalizeUnitsForSpeech('159g'), '159 grams');
  assert.equal(verbalizeUnitsForSpeech('lift 60 kg'), 'lift 60 kilograms');
  assert.equal(verbalizeUnitsForSpeech('185 lb'), '185 pounds');
  assert.equal(verbalizeUnitsForSpeech('4 oz chicken'), '4 ounces chicken');
});

test('expands rates rather than reading the slash', () => {
  assert.equal(verbalizeUnitsForSpeech('2400 cal/day'), '2400 calories per day');
  assert.equal(verbalizeUnitsForSpeech('180 g/day'), '180 grams per day');
});

test('speaks decimals and percentages as a person would', () => {
  assert.equal(verbalizeUnitsForSpeech('0.5%'), 'zero point five percent');
  assert.equal(verbalizeUnitsForSpeech('12.9% body fat'), '12 point nine percent body fat');
});

test('a bare zero is a word, not a letter', () => {
  assert.equal(verbalizeUnitsForSpeech('0 grams left'), 'zero grams left');
});

test('leaves ordinary prose untouched', () => {
  assert.equal(verbalizeUnitsForSpeech('nice work on that set'), 'nice work on that set');
  assert.equal(verbalizeUnitsForSpeech('8 reps at bodyweight'), '8 reps at bodyweight');
});
