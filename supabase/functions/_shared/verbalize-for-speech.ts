// Deterministic safety net for whatever the model still gets wrong after the voice-phrasing
// prompt instruction (see VOICE_PHRASING_NOTE in brain-config.ts) — glued unit abbreviations like
// "159g" read by TTS as digits-plus-letter, not as a word.
const UNIT_WORDS: Record<string, string> = {
  g: 'grams',
  kg: 'kilograms',
  lb: 'pounds',
  lbs: 'pounds',
  oz: 'ounces',
  km: 'kilometers',
  mi: 'miles',
  min: 'minutes',
  sec: 'seconds',
  kcal: 'calories',
  cal: 'calories',
};
const UNIT_RE = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s?(${Object.keys(UNIT_WORDS).join('|')})\\b`, 'gi');

// "cal/day", "g/day", "kcal per day" — the slash is read aloud as "slash" (or swallowed), so the
// rate has to be spelled out. Runs before UNIT_RE so the unit half is still expanded after.
const RATE_RE = new RegExp(`\\b(${Object.keys(UNIT_WORDS).join('|')})\\s*/\\s*(day|week|kg|lb|hour|hr)\\b`, 'gi');

const RATE_DENOMINATORS: Record<string, string> = {
  day: 'day',
  week: 'week',
  hour: 'hour',
  hr: 'hour',
  kg: 'kilogram',
  lb: 'pound',
};

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

// A decimal is read character-by-character by TTS often enough to be unreliable ("0.5%" came out
// as "U point five"), and a leading bare zero is the worst case — reported live as "U" and "yo".
// Spelling the fractional digits out individually is how a person says it anyway: "zero point
// five", not "zero point fifty".
function verbalizeDecimal(whole: string, fraction: string): string {
  const wholeWord = whole === '0' ? 'zero' : whole;
  const fractionWords = fraction.split('').map((d) => DIGIT_WORDS[Number(d)] ?? d).join(' ');
  return `${wholeWord} point ${fractionWords}`;
}

export function verbalizeUnitsForSpeech(text: string): string {
  return (
    text
      // Percent first: "0.5%" must become "zero point five percent", and the decimal pass below
      // would otherwise leave the bare "%" glyph stranded.
      .replace(/(\d+(?:\.\d+)?)\s*%/g, (_m, num: string) => `${num} percent`)
      .replace(RATE_RE, (_m, unit: string, per: string) => {
        const denominator = RATE_DENOMINATORS[per.toLowerCase()] ?? per;
        return `${UNIT_WORDS[unit.toLowerCase()]} per ${denominator}`;
      })
      .replace(UNIT_RE, (_match, num: string, unit: string) => `${num} ${UNIT_WORDS[unit.toLowerCase()]}`)
      .replace(/\b(\d+)\.(\d+)\b/g, (_m, whole: string, fraction: string) => verbalizeDecimal(whole, fraction))
      // A standalone zero left after the passes above — "0 grams", "0 percent".
      .replace(/(?<![\d.])0(?![\d.])/g, 'zero')
  );
}
