export type SetReportUnits = 'metric' | 'imperial';

export interface ParsedSet {
  weight: number | null;
  reps: number;
  unit?: 'seconds';
}

export interface ParseSetOptions {
  allowPositional?: boolean;
  timedExercise?: boolean;
  bareWeight?: boolean;
}

export type SpokenSetIntent =
  | { kind: 'ignore' }
  | { kind: 'stated_weight'; weight: number }
  | { kind: 'needs_details' }
  | { kind: 'log'; set: ParsedSet };

export interface SpokenSetContext {
  awaitingDetails: boolean;
  timedExercise?: boolean;
  typed?: boolean;
  legacy?: boolean;
}

export const SET_PARSER_VERSION = 3;

export const SHARED_PARSER_FROM_VERSION = 2;

export const HOLDS_MISSING_WEIGHT_FROM_VERSION = 3;

export const straightenQuotes = (text: string): string =>
  (text ?? '').replace(/[\u2018\u2019\u201A\u201B\u2032\u02BC\u0060\u00B4]/g, "'");

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

type NumberState = 'none' | 'afterOnes' | 'afterTens' | 'afterHundred';

export const normalizeSpokenNumbers = (text: string): string => {
  const tokens = text.split(/[\s-]+/);
  const out: string[] = [];
  let current = 0;
  let hasValue = false;
  let state: NumberState = 'none';

  const flush = () => {
    if (hasValue) out.push(String(current));
    current = 0;
    hasValue = false;
    state = 'none';
  };

  for (const token of tokens) {
    const clean = token.toLowerCase().replace(/[^a-z]/g, '');

    if (clean === 'and') {
      if (hasValue) continue;
      flush();
      out.push(token);
      continue;
    }

    if (clean === 'hundred') {
      current = hasValue ? (current || 1) * 100 : 100;
      hasValue = true;
      state = 'afterHundred';
      continue;
    }

    if (clean in TENS) {
      if (state === 'afterHundred') {
        current += TENS[clean];
      } else if (state === 'afterOnes' && current >= 1 && current <= 9) {
        current = current * 100 + TENS[clean];
      } else {
        flush();
        current = TENS[clean];
      }
      hasValue = true;
      state = 'afterTens';
      continue;
    }

    if (clean in ONES) {
      if (state === 'afterHundred' || state === 'afterTens') {
        current += ONES[clean];
      } else {
        flush();
        current = ONES[clean];
      }
      hasValue = true;
      state = 'afterOnes';
      continue;
    }

    flush();
    out.push(token);
  }
  flush();

  return out.join(' ');
};

const SET_ORDINAL_PATTERN = /\b(?:sets?\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s+set)\b/gi;

const POUND_UNIT = /pound|lb/i;

const WEIGHT_WITH_UNIT = /(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)\b/i;

const BARE_WEIGHT = /\b(?:at|with)\s+(\d+(?:\.\d+)?)(?=\s*(?:$|[.,!;]|(?:for|x|by|and|on)\b|×))/i;

const WEIGHT_BY_REPS = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*(?:reps?)?\.?$/i;

const SET_COUNT = /\b\d+\s*sets?\b/gi;

const toKg = (value: number, statedUnit: string | null, units: SetReportUnits): number => {
  const isPounds = statedUnit ? POUND_UNIT.test(statedUnit) : units === 'imperial';
  return isPounds ? Math.round(value * 0.453592 * 10) / 10 : value;
};

export function parseSetReport(
  raw: string,
  units: SetReportUnits = 'metric',
  options: ParseSetOptions = {},
): ParsedSet | null {
  const normalized = normalizeSpokenNumbers(straightenQuotes(raw));

  if (options.timedExercise) {
    const durationMatch = normalized.match(
      /(\d+(?:\.\d+)?)\s*(?:sec|secs|second|seconds|min|mins|minute|minutes)\b/i,
    );
    if (durationMatch) {
      const isMinutes = /min/i.test(durationMatch[0]);
      const reps = Math.round(Number(durationMatch[1]) * (isMinutes ? 60 : 1));
      return reps > 0 ? { weight: null, reps, unit: 'seconds' } : null;
    }
  }

  const bareAllowed = options.bareWeight !== false;
  const weightByReps = bareAllowed ? normalized.trim().match(WEIGHT_BY_REPS) : null;
  if (weightByReps) {
    const reps = Math.round(Number(weightByReps[2]));
    return reps > 0 ? { weight: toKg(Number(weightByReps[1]), null, units), reps } : null;
  }

  const weightMatch = normalized.match(WEIGHT_WITH_UNIT);
  const bareMatch = !weightMatch && bareAllowed ? normalized.match(BARE_WEIGHT) : null;
  const weightText = weightMatch?.[0] ?? bareMatch?.[0] ?? null;
  const repsMatch = (bareMatch ? normalized.replace(bareMatch[0], ' ') : normalized).match(/(\d+)\s*(?:reps?|x)\b/i);

  if (weightText || repsMatch) {
    const weight = weightMatch
      ? toKg(Number(weightMatch[1]), weightMatch[2], units)
      : bareMatch
        ? toKg(Number(bareMatch[1]), null, units)
        : null;
    let reps = repsMatch ? Math.round(Number(repsMatch[1])) : null;

    if (reps === null && weightText) {
      const withoutWeight = normalized.replace(weightText, ' ').replace(SET_ORDINAL_PATTERN, ' ');
      const leftover = (bareAllowed ? withoutWeight.replace(SET_COUNT, ' ') : withoutWeight).match(/\d+/);
      if (leftover) reps = Math.round(Number(leftover[0]));
    }
    if (reps === null || reps <= 0) return null;
    return { weight, reps };
  }

  if (options.allowPositional === false) return null;

  const positional = normalized.trim().match(
    /^(\d+(?:\.\d+)?)\s*(?:,|for|x|by)?\s*(\d+)\s*(?:reps?|times|each)?\.?$/i,
  );
  if (!positional) return null;

  const weight = toKg(Number(positional[1]), null, units);
  const reps = Math.round(Number(positional[2]));
  return reps > 0 ? { weight, reps } : null;
}

const STATED_WEIGHT_PATTERN =
  /^(?:(?:it'?s|its|i'?m\s+using|im\s+using|using|with|at|about|around|roughly|maybe|let'?s\s+do|lets\s+do|do|go\s+with|going\s+with|make\s+it|put\s+on)\s+)?(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)\s*\.?$/i;

export function parseStatedWeight(raw: string, units: SetReportUnits = 'metric'): number | null {
  if (parseSetReport(raw, units) !== null) return null;
  const match = normalizeSpokenNumbers(straightenQuotes(raw)).trim().match(STATED_WEIGHT_PATTERN);
  if (!match) return null;
  const weight = toKg(Number(match[1]), match[2] ?? null, units);
  return weight > 0 ? weight : null;
}

const BODYWEIGHT_REPLY =
  /^(?:just\s+|only\s+|it\s+was\s+|that\s+was\s+)?(?:my\s+)?(?:bodyweight|body\s+weight|no\s+weight|none|no\s+load|unweighted|nothing)$/i;

const WEIGHT_REPLY =
  /^(?:(?:it\s+was|it'?s|its|that\s+was|was|i\s+used|i\s+did|at|with|about|around|roughly|like)\s+)?(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)?(?:\s+each(?:\s+(?:side|hand|arm))?)?$/i;

export function parseWeightReply(raw: string, units: SetReportUnits = 'metric'): { weight: number | null } | null {
  const text = normalizeSpokenNumbers(straightenQuotes(raw)).trim().replace(/[.!?]+$/g, '').trim();
  if (!text) return null;
  if (BODYWEIGHT_REPLY.test(text)) return { weight: null };
  const match = text.match(WEIGHT_REPLY);
  if (!match) return null;
  const weight = toKg(Number(match[1]), match[2] ?? null, units);
  return weight > 0 ? { weight } : null;
}

export const needsWeightBeforeLogging = (
  set: ParsedSet,
  knownWeight: number | null,
  bodyweightWork: boolean,
): boolean => set.unit !== 'seconds' && set.weight === null && knownWeight === null && !bodyweightWork;

const COMPLETION =
  /\b(done|completed|finished|that'?s\s+it|that\s+was\s+it|racked|logged\s+it|in\s+the\s+bank)\b|(?<!\b(?:to|let'?s)\s)\bcomplete\b/i;

const PAST_REPORT = /\b(did|got|hit|managed|knocked\s+out|banged\s+out|pushed\s+out|squeezed\s+out|ended\s+up|only\s+got)\b/i;

const SET_ORDINAL =
  /\b(?:sets?\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s+set|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+set)\b/i;

const FUTURE_INTENT =
  /\b(gonna|going\s+to|i'?ll|let'?s|plan(?:ning)?\s+to|about\s+to|start(?:ing)?\s+with|i'?m\s+using|im\s+using|using|i'?m\s+on|aiming|try(?:ing)?\s+for|shoot(?:ing)?\s+for|next\s+set|this\s+set|target|want\s+to|wanna|will\s+do|should\s+i)\b/i;

const LEGACY_COMPLETION =
  /\b(done|complete|completed|finished|that'?s\s+it|that\s+was\s+it|racked|logged\s+it|in\s+the\s+bank)\b/i;

const LEGACY_FUTURE_INTENT =
  /\b(gonna|going\s+to|i'?ll|let'?s|plan(?:ning)?\s+to|about\s+to|start(?:ing)?\s+with|i'?m\s+using|im\s+using|using|i'?m\s+on|aiming|try(?:ing)?\s+for|shoot(?:ing)?\s+for|next\s+set|this\s+set|target)\b/i;

const NEGATED = /\b(?:didn'?t|did\s+not|couldn'?t|could\s+not|wasn'?t|haven'?t|never|not)\b/i;

const PAST_CONTEXT =
  /\b(?:yesterday|last\s+(?:time|week|session|workout|month|night)|ago|usually|normally|previously|before|earlier|every\s+time)\b/i;

const NOT_A_REP_COUNT =
  /\b\d+(?:\.\d+)?\s*(?:sets?|more|left|to\s+go|minutes?|mins?|seconds?|secs?|%|percent|kgs?|kilos?|kilograms?|lbs?|pounds?|days?|weeks?|hours?|times|am|pm)\b/gi;

const isCounting = (raw: string): boolean => {
  const bare = normalizeSpokenNumbers(raw)
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
  return /^\d+(?:\s*[,and]*\s*\d+)*$/i.test(bare);
};

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

const isReportFramed = (sentence: string): boolean =>
  COMPLETION.test(sentence) || PAST_REPORT.test(sentence) || SET_ORDINAL.test(sentence);

const PRONOUN_ONE =
  /\b(?:that|this|the|last|next|each|every|another|which|no|any|some|a\s+good|a\s+hard|an\s+easy)\s+one\b|\bone\s+(?:more|of\s+(?:them|those|these))\b/gi;

function extractReportedSet(raw: string, units: SetReportUnits): ParsedSet | null {
  const candidates = splitSentences(normalizeSpokenNumbers(raw.replace(PRONOUN_ONE, ' '))).filter(
    (sentence) =>
      !sentence.endsWith('?') &&
      isReportFramed(sentence) &&
      !NEGATED.test(sentence) &&
      !PAST_CONTEXT.test(sentence) &&
      !(FUTURE_INTENT.test(sentence) && !COMPLETION.test(sentence)),
  );

  for (const sentence of candidates.reverse()) {
    const weightMatch = sentence.match(WEIGHT_WITH_UNIT);
    const plural = sentence.match(/\bthe\s+(\d+)s\b/i);
    const bareMatch = !weightMatch && !plural ? sentence.match(BARE_WEIGHT) : null;
    const weight = weightMatch
      ? toKg(Number(weightMatch[1]), weightMatch[2], units)
      : plural
        ? toKg(Number(plural[1]), null, units)
        : bareMatch
          ? toKg(Number(bareMatch[1]), null, units)
          : null;

    const numbers = (bareMatch ? sentence.replace(bareMatch[0], ' ') : sentence)
      .replace(WEIGHT_WITH_UNIT, ' ')
      .replace(/\b\d+s\b/gi, ' ')
      .replace(SET_ORDINAL_PATTERN, ' ')
      .replace(NOT_A_REP_COUNT, ' ')
      .match(/\b\d+\b/g);

    if (!numbers || numbers.length !== 1) continue;
    const reps = Number(numbers[0]);
    if (!Number.isInteger(reps) || reps < 2 || reps > 100) continue;
    return { weight, reps };
  }
  return null;
}

export function classifySpokenSet(
  raw: string,
  units: SetReportUnits = 'metric',
  context: SpokenSetContext = { awaitingDetails: false },
): SpokenSetIntent {
  const text = straightenQuotes(raw).trim();
  if (!text) return { kind: 'ignore' };
  if (!context.typed && isCounting(text)) return { kind: 'ignore' };

  const legacy = !!context.legacy;
  const completed = (legacy ? LEGACY_COMPLETION : COMPLETION).test(text);
  const reported = completed || PAST_REPORT.test(text) || SET_ORDINAL.test(text);
  const intended = !completed && (legacy ? LEGACY_FUTURE_INTENT : FUTURE_INTENT).test(text);
  const asked = !legacy && text.endsWith('?');

  const parsed = parseSetReport(text, units, {
    allowPositional: context.typed ?? false,
    timedExercise: context.timedExercise,
    bareWeight: !legacy,
  });

  if (parsed) {
    if (intended && !context.awaitingDetails) {
      const weight = parseStatedWeight(text, units);
      return weight != null ? { kind: 'stated_weight', weight } : { kind: 'ignore' };
    }
    if (asked && !context.awaitingDetails) return { kind: 'ignore' };
    const explicitPair = parsed.weight !== null && parsed.unit !== 'seconds';
    if (reported || context.awaitingDetails || explicitPair || parsed.unit === 'seconds' || context.typed) {
      return { kind: 'log', set: parsed };
    }
    return { kind: 'ignore' };
  }

  if (!legacy && !context.timedExercise) {
    const loose = extractReportedSet(text, units);
    if (loose) return { kind: 'log', set: loose };
  }

  if (completed) return { kind: 'needs_details' };

  const weight = parseStatedWeight(text, units);
  if (weight != null) return { kind: 'stated_weight', weight };
  return { kind: 'ignore' };
}

export function looksLikeFinishedSetReport(text: string): boolean {
  const raw = straightenQuotes(text).trim();
  if (!raw || isCounting(raw)) return false;
  if (COMPLETION.test(raw)) return true;
  return extractReportedSet(raw, 'metric') !== null;
}

export function hasSetCompletionSignal(text: string): boolean {
  return COMPLETION.test(straightenQuotes(text));
}

export function describesPlannedSet(text: string): boolean {
  const raw = straightenQuotes(text);
  return !COMPLETION.test(raw) && FUTURE_INTENT.test(raw) && extractReportedSet(raw, 'metric') === null;
}

const START_SET_PATTERNS = [
  /^(?:ok(?:ay)?|alright|right|yeah|yep)?\s*,?\s*(?:let'?s\s+)?(?:go|start|begin|do|move)(?:ing)?\s*(?:on\s+)?(?:to\s+)?(?:the\s+)?(?:next\s+)?(?:set)?\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?\s*$/,
  /^(?:i'?m\s+)?(?:ready|done)(?:\s+(?:for|with)\s+(?:the\s+)?(?:next\s+)?(?:set|rest)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)?)?\s*$/,
  /^(?:next\s+set|set\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))\s*$/,
  /^(?:skip|end|stop)\s+(?:the\s+)?rest\s*$/,
  /^rest\s+(?:is\s+)?(?:done|over|finished)\s*$/,
];

export function looksLikeStartSetCommand(raw: string): boolean {
  const normalized = straightenQuotes(raw).trim().toLowerCase().replace(/[.!?,]+$/g, '');
  if (!normalized) return false;
  return START_SET_PATTERNS.some((pattern) => pattern.test(normalized));
}

export const AFFIRMATION = /\b(yes|yeah|yep|yup|correct|that['\u2019]?s right|right|confirm(?:ed)?|i did|sure|affirmative)\b/i;

export const NEGATION = /\b(no|nope|nah|wrong|incorrect|didn['\u2019]?t|not right)\b/i;

export const isNegation = (text: string): boolean => NEGATION.test(straightenQuotes(text));

export const isAffirmation = (text: string): boolean =>
  AFFIRMATION.test(straightenQuotes(text)) && !isNegation(text);

export const COACH_ASKS_FOR_SET_DETAILS_BEFORE_V3 =
  /\b(how many (?:reps|did you get|was that)|what did you get|reps did you (?:get|do)|how['\u2019]d that set go|what weight (?:did|was) (?:you|that))\b/i;

export const COACH_ASKS_FOR_SET_DETAILS =
  /\b(how many (?:reps|did you get|was that)|what did you get|reps did you (?:get|do)|how['\u2019]d that set go|what weight (?:did|was) (?:you|that)|what was the rep count)\b/i;

const LOW_RATIO = 0.4;
const HIGH_RATIO = 2.5;

const LOAD_KG = /(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|kilogrammes?|kilograms?)\b/i;
const LOAD_LB = /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i;

export function parseLoadSchemeKg(scheme: string | null | undefined): number | null {
  if (!scheme) return null;
  const kg = LOAD_KG.exec(scheme);
  if (kg) return Number(kg[1]);
  const lb = LOAD_LB.exec(scheme);
  if (lb) return Math.round(Number(lb[1]) * 0.453592 * 10) / 10;
  return null;
}

export function isImplausibleWeightJump(
  next: number | null | undefined,
  reference: number | null | undefined,
): boolean {
  if (next == null || reference == null) return false;
  if (next <= 0 || reference <= 0) return false;
  const ratio = next / reference;
  return ratio < LOW_RATIO || ratio > HIGH_RATIO;
}
