import { normalizeArea } from './injury-validator.ts';

export interface ActiveInjuryRow {
  area: string;
  pain_level: number | null;
  severity: string | null;
  created_at: string;
}

const HIGH_PAIN_THRESHOLD = 6;

const HIGH_PAIN_DIRECTIVE =
  'At this level, workout coaching stops until it comes down. Do not recommend exercise for any ' +
  'body part today, do not offer to swap in a different session, and do not suggest stretches. ' +
  'Never tell them a movement or session is "safe" or "doesn\'t stress" this area: you cannot ' +
  'know that. Ask whether the pain has changed since this was logged; if it is still elevated ' +
  'or worsening, tell them plainly to get it assessed by a qualified clinician before training, ' +
  'and that for today the plan is rest and avoiding what aggravates it. If they choose to train ' +
  'anyway, that is their call: do not endorse it as safe, and tell them to stop if the pain ' +
  'rises. This lifts only once they report it below 6/10 or say a clinician has assessed it.';

const LOW_PAIN_DIRECTIVE =
  'Ask how it feels today before giving any guidance. If you do suggest a stretch or ' +
  'exercise, every one must carry all three: how to perform it, an explicit hold time or ' +
  'rep count (e.g. "30 seconds each side", "8 slow reps"), and an explicit stop rule ' +
  'naming the sensation that means stop now. A list of movement names without those is ' +
  'not acceptable. Never call it "fine" or "safe", and never say that a few reps or ' +
  'stretches means they are "good to go" or cleared to train.';

export const injuryDirective = (painLevel: number | null | undefined): string =>
  painLevel != null && painLevel >= HIGH_PAIN_THRESHOLD ? HIGH_PAIN_DIRECTIVE : LOW_PAIN_DIRECTIVE;

const sideOf = (area: string): string =>
  area.toLowerCase().match(/(?:^|[^a-z])(left|right)(?=[^a-z]|$)/)?.[1] ?? '';

const areaKey = (area: string): string => `${sideOf(area)}:${normalizeArea(area)}`;

const latestPerArea = (rows: ActiveInjuryRow[]): ActiveInjuryRow[] => {
  const latest = new Map<string, ActiveInjuryRow>();
  for (const row of [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )) {
    latest.set(areaKey(row.area), row);
  }
  return [...latest.values()];
};

const describeInjuryRow = (inj: ActiveInjuryRow): string => {
  const painPart =
    inj.pain_level != null
      ? `pain reported ${inj.pain_level}/10`
      : inj.severity
        ? `severity noted as "${inj.severity}"`
        : 'no pain level on file';
  return `  - ${inj.area}: ${painPart}, logged ${new Date(inj.created_at).toISOString().slice(0, 10)}. ${injuryDirective(inj.pain_level)}`;
};

export const contextHasInjuryGate = (contextBlock: string): boolean =>
  contextBlock.includes('Active injuries on file') || contextBlock.includes('Injury history failed to load');

export function describeActiveInjuries(
  activeInjuries: ActiveInjuryRow[] | null,
  fetchFailed: boolean,
): string | null {
  if (fetchFailed) {
    return (
      'Injury history failed to load this turn. This is NOT the same as having no injuries on ' +
      'file — treat it as unknown, not clear. Do not recommend exercise, do not clear any movement ' +
      'as safe, and do not imply anything is fine to train until you can confirm there is no active ' +
      'injury: ask the user directly whether they have any current pain or injury before giving ' +
      'exercise guidance this turn.'
    );
  }
  if (!activeInjuries || activeInjuries.length === 0) return null;

  // One area, one entry — the most recent. Each update is logged as a new row rather than an edit,
  // so an area the user has reported twice arrived here as several entries at different pain
  // levels. Confirmed live: after "it's down to 3 out of 10" the coach still read back "still at
  // that 8 out of 10", because the superseded row was sitting in this list next to the current one.
  return [
    'Active injuries on file — check this before ANY exercise or stretch guidance for the ' +
      'affected area, every time, even mid-conversation on a topic already covered:',
    ...latestPerArea(activeInjuries).map(describeInjuryRow),
  ].join('\n');
}

const AREA_MENTION: Record<string, RegExp> = {
  si_joint: /\b(?:s\.?\s?i\.?[\s-]*joints?|sacro\w*|pelvi\w*)/i,
  lumbar: /\b(?:lower[\s-]+back|my\s+back|back\s+(?:pain|is|feels|hurts)|spine|spinal|lumbar)\b/i,
  knee: /\bknees?\b/i,
  shoulder: /\bshoulders?\b/i,
  elbow: /\belbows?\b/i,
  wrist: /\bwrists?\b/i,
  hip: /\bhips?\b/i,
  ankle: /\bankles?\b/i,
};

const GENERIC_AREA_WORDS = new Set(['left', 'right', 'joint', 'upper', 'lower', 'side']);

const STRETCH_FORMAT_RULE =
  'Whenever you do suggest a stretch or exercise for an injured area, each one must carry how to ' +
  'perform it, an explicit hold time or rep count, and the sensation that means stop now. A list ' +
  'of names is not acceptable, and never call it "fine" or "safe".';

const STRETCH_REQUEST = /\b(?:stretch\w*|warm[\s-]?up|mobility|yoga|foam[\s-]+roll\w*)\b/i;

const TRAINING_INTENT =
  /\b(?:gym|work(?:ing)?[\s-]?out|workouts?|train(?:ing)?|lift(?:ing)?|session|leg\s+day|exercis\w*)\b/i;

const isHighPain = (inj: ActiveInjuryRow): boolean =>
  inj.pain_level != null && inj.pain_level >= HIGH_PAIN_THRESHOLD;

const mentionPatternFor = (area: string): RegExp | null => {
  const known = AREA_MENTION[normalizeArea(area)];
  if (known) return known;
  const words = area
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !GENERIC_AREA_WORDS.has(w))
    .map((w) => w.replace(/s$/, ''));
  return words.length > 0 ? new RegExp(`\\b(?:${words.join('|')})s?\\b`, 'i') : null;
};

export function describeMentionedInjury(
  currentUserText: string | null | undefined,
  activeInjuries: ActiveInjuryRow[] | null,
): string | null {
  const text = (currentUserText ?? '').trim();
  if (!text || !activeInjuries || activeInjuries.length === 0) return null;

  const asksToStretch = STRETCH_REQUEST.test(text);
  const headsToTrain = TRAINING_INTENT.test(text);
  const touched = latestPerArea(activeInjuries).filter(
    (inj) =>
      asksToStretch || (headsToTrain && isHighPain(inj)) || !!mentionPatternFor(inj.area)?.test(text),
  );
  if (touched.length === 0) return null;

  return [
    'This message touches an injury on file. Before anything else in your reply, even a short ' +
      '"take your time" or "let me know when you are ready", name the record below with its pain ' +
      'level and date, and ask how it feels right now. Do not suggest any stretch, warm-up or ' +
      'exercise for it until you know how it feels today. If they already told you in this ' +
      'message or earlier today, go by that answer instead of asking again. If this message gives ' +
      'a new pain level, call record_injury with it first and follow the guidance that call ' +
      'returns in place of the directive below. Never say they already did the stretches unless ' +
      'they told you they did. ' +
      STRETCH_FORMAT_RULE,
    ...touched.map(describeInjuryRow),
  ].join('\n');
}

// Pain mentioned in the CURRENT message, which is a different problem from the injuries above:
// those are already on file, this one is not yet. Confirmed live that timing is unreliable — an
// 8/10 SI-joint report was logged immediately in one run and only three turns later in another,
// so a user who closed the app in between would have lost it entirely. This makes the turn that
// hears it the turn that records it.
const PAIN_MENTION =
  /\b(?:pain|painful|hurts?|hurting|sore|soreness|ache|aching|aches|injur(?:y|ed|ies)|tweak(?:ed)?|strain(?:ed)?|sprain(?:ed)?|pulled|flare[\s-]?up|stiff(?:ness)?)\b/i;
// A severity rating on its own carries no pain word — "it's down to about 3 out of 10 now" left an
// 8/10 record standing, so every later turn kept gating on a number the user had already moved on
// from. An update matters as much as the first report.
const PAIN_RATING = /\b(?:10|[0-9])\s*(?:\/|out\s+of)\s*10\b/i;
const BARE_RATING =
  /\b(?:about|around|roughly|maybe|like|still|now|is|it'?s|its|down\s+to|up\s+to)\s+(?:at\s+)?(?:an?\s+)?(?:10|[0-9])\b(?!\s*(?:reps?|sets?|x\b|lbs?|kgs?|pounds?|kilos?|mins?|minutes?|secs?|seconds?|hours?|hrs?|am\b|pm\b|:|%|days?|weeks?|times?|more|of\b))/i;
const PAIN_CHANGE = /\b(?:worse|worsening|worsened|flar(?:e|ed|ing)(?:\s+up)?|spik(?:e|ed|ing))\b/i;
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};
const spokenNumbersToDigits = (text: string): string =>
  text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (w) => NUMBER_WORDS[w.toLowerCase()]);
const PAIN_NEGATED =
  /\b(?:no|none|not|without|never|free\s+of|nothing)\b[^.!?]{0,30}\b(?:pain|injur|hurt|sore|ache)/i;

export function describeUnloggedPainReport(
  currentUserText: string | null | undefined,
  injuryOnFile = false,
): string | null {
  const text = spokenNumbersToDigits((currentUserText ?? '').trim().replace(/[\u2018\u2019]/g, "'"));
  const rated =
    PAIN_RATING.test(text) || (injuryOnFile && (BARE_RATING.test(text) || PAIN_CHANGE.test(text)));
  if (!text || (!PAIN_MENTION.test(text) && !rated) || PAIN_NEGATED.test(text)) return null;

  return (
    'The user just mentioned pain, an injury, or a pain rating in this message. Before any training ' +
    'guidance, call record_injury for it this turn — include the pain level if they gave one or it ' +
    'can reasonably be inferred — even if you are still asking clarifying questions, and even if you ' +
    'intend to log it later. If this is a CHANGE to something already on file (better, worse, or a ' +
    'new number), call record_injury again with the new level so the record stops reporting a figure ' +
    'they have moved past. Only skip the call when it is already on file above at the same level.'
  );
}
