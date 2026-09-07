import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verbalizeUnitsForSpeech } from './verbalize-for-speech.ts';

// Every case Damion reported hearing wrong, kept as a regression net — this layer is the only
// thing standing between a model that writes "0.5%" and TTS reading it as "U point five".
Deno.test('expands unit abbreviations', () => {
  assertEquals(verbalizeUnitsForSpeech('159g'), '159 grams');
  assertEquals(verbalizeUnitsForSpeech('lift 60 kg'), 'lift 60 kilograms');
  assertEquals(verbalizeUnitsForSpeech('185 lb'), '185 pounds');
  assertEquals(verbalizeUnitsForSpeech('4 oz chicken'), '4 ounces chicken');
});

Deno.test('expands rates rather than reading the slash', () => {
  assertEquals(verbalizeUnitsForSpeech('2400 cal/day'), '2400 calories per day');
  assertEquals(verbalizeUnitsForSpeech('180 g/day'), '180 grams per day');
});

Deno.test('speaks decimals and percentages as a person would', () => {
  assertEquals(verbalizeUnitsForSpeech('0.5%'), 'zero point five percent');
  assertEquals(verbalizeUnitsForSpeech('12.9% body fat'), '12 point nine percent body fat');
});

Deno.test('a bare zero is a word, not a letter', () => {
  assertEquals(verbalizeUnitsForSpeech('0 grams left'), 'zero grams left');
});

Deno.test('leaves ordinary prose untouched', () => {
  assertEquals(verbalizeUnitsForSpeech('nice work on that set'), 'nice work on that set');
  assertEquals(verbalizeUnitsForSpeech('8 reps at bodyweight'), '8 reps at bodyweight');
});
