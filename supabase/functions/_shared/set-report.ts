import { kgToLb } from './weight-units.ts';
import type { RestLengthScope } from './rest-length.ts';

export type SetReportUnits = 'metric' | 'imperial';

export interface ParsedSet {
  weight: number | null;
  reps: number;
  unit?: 'seconds';
  inferredWeight?: boolean;
}

export interface ParseSetOptions {
  allowPositional?: boolean;
  timedExercise?: boolean;
  bareWeight?: boolean;
  version?: number;
}

export type SpokenSetIntent =
  | { kind: 'ignore' }
  | { kind: 'stated_weight'; weight: number }
  | { kind: 'needs_details' }
  | { kind: 'unconfirmed'; set: ParsedSet }
  | { kind: 'log'; set: ParsedSet };

export interface SpokenSetContext {
  awaitingDetails: boolean;
  timedExercise?: boolean;
  typed?: boolean;
  legacy?: boolean;
  confirmsBareReps?: boolean;
  resting?: boolean;
  version?: number;
  confirmed?: boolean;
  exerciseHasLoggedSets?: boolean;
}

export const SET_PARSER_VERSION = 7;

export const STRICT_REPORTS_FROM_VERSION = 6;

export const CONFIRMS_BARE_REPS_FROM_VERSION = 5;

export const SHARED_PARSER_FROM_VERSION = 2;

export const HOLDS_MISSING_WEIGHT_FROM_VERSION = 3;

export const RESTATEMENT_RULE_FROM_VERSION = 4;

export const DURATION_INSTRUCTIONS_FROM_VERSION = 7;

const DURATION_INSTRUCTION =
  /^(?:(?:ok(?:ay)?|actually|hey|coach|um+|uh+|so|and|alright|yeah|yes|no|can\s+you|could\s+you|please|let'?s)[\s,]+)*(?:always\s+|from\s+now\s+on\s+)?(?:(?:make|set|change|put|bump|drop|keep)\s+(?:it|that|this|this\s+one|the\s+timer|timer|my\s+rests?|the\s+rests?|rests?)|add|adding|extend|give\s+me|use|go\s+with)\b/i;

export const RESTATEMENT_WINDOW_MS = 20_000;

export const isRestatement = (
  lastSetLoggedAt: number | null | undefined,
  now: number = Date.now(),
  restFinishedAt?: number | null,
): boolean =>
  typeof lastSetLoggedAt === 'number' &&
  now - lastSetLoggedAt >= 0 &&
  now - lastSetLoggedAt < RESTATEMENT_WINDOW_MS &&
  !(typeof restFinishedAt === 'number' && restFinishedAt > lastSetLoggedAt);

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

const BARE_WEIGHT_STRICT =
  /\b(?:at|(?<!\b(?:done|finished|completed)\s+)with)\s+(\d+(?:\.\d+)?)(?!\d|\.\d)(?!\s*(?:reps?|times|sets?|seconds?|secs?|minutes?|mins?|more|left|to\s+go)\b)(?=\s*(?:$|[.,!;]|(?:for|x|by|and|on|done|finished|completed|complete|each|per|a\s+side|this|that|then|now|today)\b|×))/i;

const MOVED_WEIGHT =
  /\b(?:(?:went|bumped|moved|jumped|stepped)\s+(?:it\s+)?(?:up\s+)?to|up\s+to|i\s+used|dropped\s+(?:it\s+)?(?:down\s+)?to)\s+(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)?(?!\d|\.\d)(?!\s*(?:reps?|times|sets?|seconds?|secs?|minutes?|mins?|more)\b)/i;

const DUMBBELL_PLURAL_PAIR = /\b(\d+(?:\.\d+)?)s(?=\s*(?:[x×]|for)\s*\d)/gi;

const NOT_A_WEIGHT_NUMBER =
  /\b(?:this|that|the|last|next|each|every|another|no|any)\s+1\b|\b(?:rpe|rir)\s*\d+(?:\.\d+)?|\b\d+(?:\.\d+)?\s*(?:sets?|more|left|to\s+go|minutes?|mins?|seconds?|secs?|%|percent|days?|weeks?|hours?|times|am|pm|out\s+of\s+\d+)\b/gi;
const WEIGHT_BY_REPS = /^(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*(?:reps?)?\.?$/i;

const SET_COUNT = /\b\d+\s*sets?\b/gi;

const toKg = (value: number, statedUnit: string | null, units: SetReportUnits): number => {
  const isPounds = statedUnit ? POUND_UNIT.test(statedUnit) : units === 'imperial';
  return isPounds ? Math.round(value * 0.453592 * 10) / 10 : value;
};

const isStrict = (version: number | undefined): boolean =>
  (version ?? SET_PARSER_VERSION) >= STRICT_REPORTS_FROM_VERSION;

const UNIT_GROUP = '(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)';
const NOT_AFTER_NUMBER = '(?![\\d.:/])(?!\\s*(?:sets?|seconds?|secs?|minutes?|mins?|more|rounds?|%|percent)\\b)';
const NOT_A_SET_REFERENCE = '(?<!\\bsets?\\s*#?\\s*)(?<![\\d.:/])';

const SLASH_PAIR = new RegExp(`${NOT_A_SET_REFERENCE}(\\d+(?:\\.\\d+)?)\\s*${UNIT_GROUP}?\\s*\\/\\s*(\\d+)${NOT_AFTER_NUMBER}`, 'i');
const AT_PAIR = new RegExp(`${NOT_A_SET_REFERENCE}(\\d+)\\s*(?:reps?\\s*)?@\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_GROUP}?`, 'i');
const FOR_PAIR = new RegExp(`${NOT_A_SET_REFERENCE}(\\d+(?:\\.\\d+)?)\\s*${UNIT_GROUP}?\\s+for\\s+(\\d+)${NOT_AFTER_NUMBER}`, 'i');
const X_PAIR = new RegExp(`${NOT_A_SET_REFERENCE}(\\d+(?:\\.\\d+)?)\\s*${UNIT_GROUP}?\\s*[x×]\\s*(\\d+)${NOT_AFTER_NUMBER}`, 'i');

const pairOf = (weight: string, unit: string | undefined, reps: string, units: SetReportUnits): ParsedSet | null => {
  const r = Number(reps);
  const w = Number(weight);
  if (!Number.isInteger(r) || r < 1 || r > 100 || !(w > 0)) return null;
  return { weight: toKg(w, unit ?? null, units), reps: r };
};

const findWeightRepsPair = (text: string, units: SetReportUnits): ParsedSet | null => {
  const slash = text.match(SLASH_PAIR);
  if (slash) return pairOf(slash[1], slash[2], slash[3], units);
  const at = text.match(AT_PAIR);
  if (at) return pairOf(at[2], at[3], at[1], units);
  const forPair = text.match(FOR_PAIR);
  if (forPair) return pairOf(forPair[1], forPair[2], forPair[3], units);
  const x = text.match(X_PAIR);
  if (x && (x[2] || Number(x[1]) >= 15)) return pairOf(x[1], x[2], x[3], units);
  return null;
};

export const parseSetReport = (
  raw: string,
  units: SetReportUnits = 'metric',
  options: ParseSetOptions = {},
): ParsedSet | null => {
  const strict = isStrict(options.version);
  const normalized = normalizeSpokenNumbers(strict ? straightenQuotes(raw).replace(PRONOUN_ONE, ' ') : straightenQuotes(raw));

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
  const text = strict ? normalized.replace(DUMBBELL_PLURAL_PAIR, '$1') : normalized;
  const weightByReps = bareAllowed ? text.trim().match(WEIGHT_BY_REPS) : null;
  if (weightByReps) {
    const reps = Math.round(Number(weightByReps[2]));
    return reps > 0 ? { weight: toKg(Number(weightByReps[1]), null, units), reps } : null;
  }

  if (strict && bareAllowed) {
    const pair = findWeightRepsPair(text, units);
    if (pair) return pair;
  }

  const movedMatch = strict && bareAllowed ? text.match(MOVED_WEIGHT) : null;
  const weightMatch = movedMatch ? null : text.match(WEIGHT_WITH_UNIT);
  const bareMatch = !movedMatch && !weightMatch && bareAllowed ? text.match(strict ? BARE_WEIGHT_STRICT : BARE_WEIGHT) : null;
  const weightText = movedMatch?.[0] ?? weightMatch?.[0] ?? bareMatch?.[0] ?? null;
  const repsMatch = (bareMatch || movedMatch ? text.replace((bareMatch ?? movedMatch)![0], ' ') : text).match(
    strict ? /(?<![\d.])(\d+)\s*(?:reps?|x)\b/i : /(\d+)\s*(?:reps?|x)\b/i,
  );

  if (weightText || repsMatch) {
    let weight = movedMatch
      ? toKg(Number(movedMatch[1]), movedMatch[2] ?? null, units)
      : weightMatch
        ? toKg(Number(weightMatch[1]), weightMatch[2], units)
        : bareMatch
          ? toKg(Number(bareMatch[1]), null, units)
          : null;
    let reps = repsMatch ? Math.round(Number(repsMatch[1])) : null;
    let inferredWeight = false;

    if (strict && weight === null && repsMatch && bareAllowed) {
      const leftovers = (text.replace(repsMatch[0], ' ').replace(SET_ORDINAL_PATTERN, ' ').replace(NOT_A_WEIGHT_NUMBER, ' ').match(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g) ?? [])
        .map(Number)
        .filter((n) => n >= 5 && n <= 1000);
      if (leftovers.length === 1) {
        weight = toKg(leftovers[0], null, units);
        inferredWeight = true;
      }
    }

    if (reps === null && weightText) {
      const withoutWeight = text.replace(weightText, ' ').replace(SET_ORDINAL_PATTERN, ' ');
      const rest = bareAllowed ? withoutWeight.replace(SET_COUNT, ' ') : withoutWeight;
      if (strict) {
        const whole = (rest.match(/\d+(?:\.\d+)?/g) ?? []).find((n) => !n.includes('.'));
        if (whole) reps = Number(whole);
      } else {
        const leftover = rest.match(/\d+/);
        if (leftover) reps = Math.round(Number(leftover[0]));
      }
    }
    if (reps === null || reps <= 0) return null;
    return inferredWeight ? { weight, reps, inferredWeight } : { weight, reps };
  }

  if (options.allowPositional === false) return null;

  const positional = text.trim().match(
    /^(\d+(?:\.\d+)?)(?:\s*(?:,|for|x|by)\s*|\s+)(\d+)\s*(?:reps?|times|each)?\.?$/i,
  );
  if (!positional) return null;

  const weight = toKg(Number(positional[1]), null, units);
  const reps = Math.round(Number(positional[2]));
  return reps > 0 ? { weight, reps } : null;
};

const STATED_WEIGHT_PATTERN =
  /^(?:(?:it'?s|its|i'?m\s+using|im\s+using|using|with|at|about|around|roughly|maybe|let'?s\s+do|lets\s+do|do|go\s+with|going\s+with|make\s+it|put\s+on)\s+)?(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)\s*\.?$/i;

export const parseStatedWeight = (raw: string, units: SetReportUnits = 'metric', version?: number): number | null => {
  if (parseSetReport(raw, units, { version }) !== null) return null;
  const match = normalizeSpokenNumbers(straightenQuotes(raw)).trim().match(STATED_WEIGHT_PATTERN);
  if (!match) return null;
  const weight = toKg(Number(match[1]), match[2] ?? null, units);
  return weight > 0 ? weight : null;
};

export const SPEECH_REFERENCE =
  /\b(?:i\s+(?:remember|already)\s+(?:said|asked|told)|i\s+(?:asked|told)\s+(?:you\s+)?for|you\s+(?:said|told\s+me|heard|put|had)|i\s+remember\s+i|asked\s+for)\b/i;

const WEIGHT_CHANGE_VERB =
  /\b(?:go(?:ing)?|gonna\s+go|move|moving|switch(?:ing)?|bump(?:ing)?|jump(?:ing)?|take|taking|push(?:ing)?|drop(?:ping)?|come|coming|step(?:ping)?)\s+(?:it\s+|up\s+|down\s+|back\s+){0,2}(?:to|at|with)\s+|\b(?:use|using|stay(?:ing)?\s+(?:at|on)|stick(?:ing)?\s+(?:to|with|at))\s+(?:it\s+|up\s+|down\s+|back\s+){0,2}(?:to\s+|at\s+|with\s+)?|\b(?:make|set|put|load|change)\s+(?:it|the\s+weight|the\s+load|that)?\s*(?:to|at|on)?\s*|\bi\s+(?:asked|told\s+you)\s+for\s+|\bup\s+it\s+to\s+|\bi\s+want\s+(?:it\s+)?(?:to\s+be\s+|at\s+)?/i;

const REPS_OR_SETS_AFTER = /^\s*(?:reps?|sets?|times|seconds?|secs?|minutes?|mins?|%|percent)\b/i;

export const parseWeightChangeRequest = (
  raw: string,
  units: SetReportUnits = 'metric',
  version?: number,
  options?: { ignoreSetReport?: boolean },
): number | null => {
  const text = normalizeSpokenNumbers(straightenQuotes(raw).replace(PRONOUN_ONE, ' '));
  if (COMPLETION.test(withoutNegatedCompletion(text))) return null;
  if (!options?.ignoreSetReport && parseSetReport(text, units, { version }) !== null) return null;
  const verb = WEIGHT_CHANGE_VERB.exec(text);
  if (!verb) return null;
  const rest = text.slice(verb.index + verb[0].length);
  const match = rest.match(/^\s*(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)?/i);
  if (!match) return null;
  if (!match[2] && REPS_OR_SETS_AFTER.test(rest.slice(match[0].length))) return null;
  if (!match[2] && /\bset\s*$/i.test(text.slice(0, verb.index + verb[0].length))) return null;
  const weight = toKg(Number(match[1]), match[2] ?? null, units);
  return weight > 0 ? weight : null;
};

const BODYWEIGHT_REPLY =
  /^(?:just\s+|only\s+|it\s+was\s+|that\s+was\s+)?(?:my\s+)?(?:bodyweight|body\s+weight|no\s+weight|none|no\s+load|unweighted|nothing)$/i;

const WEIGHT_REPLY =
  /^(?:(?:it\s+was|it'?s|its|that\s+was|was|i\s+used|i\s+did|at|with|about|around|roughly|like)\s+)?(\d+(?:\.\d+)?)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?)?(?:\s+each(?:\s+(?:side|hand|arm))?)?$/i;

export const parseWeightReply = (raw: string, units: SetReportUnits = 'metric'): { weight: number | null } | null => {
  const text = normalizeSpokenNumbers(straightenQuotes(raw)).trim().replace(/[.!?]+$/g, '').trim();
  if (!text) return null;
  if (BODYWEIGHT_REPLY.test(text)) return { weight: null };
  const match = text.match(WEIGHT_REPLY);
  if (!match) return null;
  const weight = toKg(Number(match[1]), match[2] ?? null, units);
  return weight > 0 ? { weight } : null;
};

export const needsWeightBeforeLogging = (
  set: ParsedSet,
  knownWeight: number | null,
  bodyweightWork: boolean,
): boolean => set.unit !== 'seconds' && set.weight === null && knownWeight === null && !bodyweightWork;

const COMPLETION =
  /\b(done|completed|finished|that'?s\s+it|that\s+was\s+it|racked|logged\s+it|in\s+the\s+bank)\b|(?<!\b(?:to|let'?s)\s)\bcomplete\b/i;

const NEGATED_COMPLETION =
  /\b(?:haven'?t|have\s+not|hasn'?t|has\s+not|hadn'?t|didn'?t|did\s+not|not|never|isn'?t|is\s+not|wasn'?t|was\s+not|aren'?t|yet\s+to)\s+(?:(?:even|actually|really|yet|been|quite|fully|my|the|that|this)\s+){0,3}(?:done|completed|finished|complete)\b/gi;

const withoutNegatedCompletion = (text: string): string => text.replace(NEGATED_COMPLETION, ' ');

const PAST_REPORT = /\b(did|got|hit|managed|knocked\s+out|banged\s+out|pushed\s+out|squeezed\s+out|ended\s+up|only\s+got)\b/i;

const PAST_STATEMENT = /\b(?:that|it|this\s+one|that\s+one)\s+was\b|\bi\s+(?:just\s+)?(?:made|completed|finished)\b/i;

const SET_ORDINAL =
  /\b(?:sets?\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s+set|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+set)\b/i;

const FUTURE_INTENT =
  /\b(gonna|going\s+to|i'?ll|let'?s|plan(?:ning)?\s+to|about\s+to|start(?:ing)?\s+with|i'?m\s+using|im\s+using|using|i'?m\s+on|aiming|try(?:ing)?\s+for|shoot(?:ing)?\s+for|next\s+set|this\s+set|target|want\s+to|wanna|will\s+do|should\s+i)\b/i;

const STRICT_FUTURE_INTENT = /\bnext\s+(?:time|week|session|workout|round)\b|\bcan\s+i\b|\bshould\s+i\b/i;

const LEGACY_COMPLETION =
  /\b(done|complete|completed|finished|that'?s\s+it|that\s+was\s+it|racked|logged\s+it|in\s+the\s+bank)\b/i;

const LEGACY_FUTURE_INTENT =
  /\b(gonna|going\s+to|i'?ll|let'?s|plan(?:ning)?\s+to|about\s+to|start(?:ing)?\s+with|i'?m\s+using|im\s+using|using|i'?m\s+on|aiming|try(?:ing)?\s+for|shoot(?:ing)?\s+for|next\s+set|this\s+set|target)\b/i;

const NEGATED = /\b(?:didn'?t|did\s+not|couldn'?t|could\s+not|wasn'?t|haven'?t|never|not)\b/i;

const PAST_CONTEXT =
  /\b(?:yesterday|last\s+(?:time|week|session|workout|month|night)|ago|usually|normally|previously|before|earlier|every\s+time)\b/i;

const NOT_A_REP_COUNT =
  /\b\d+(?:\.\d+)?\s*(?:sets?|more|left|to\s+go|minutes?|mins?|seconds?|secs?|%|percent|kgs?|kilos?|kilograms?|lbs?|pounds?|days?|weeks?|hours?|times|am|pm)\b/gi;

export const mentionsEarlierWorkout = (raw: string): boolean => PAST_CONTEXT.test(straightenQuotes(raw ?? ''));

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

const LAST_SET = /\b(?:last|final)\s+(?:set|one)\b/i;

const STRICT_PAST_REPORT =
  /\b(?:nailed|crushed|smashed|killed|cranked\s+out|pumped\s+out|ground\s+out|finished\s+off|did\s+all)\b/i;

const THATS_A_COUNT = /\bthat'?s\s+(?=\d)/i;

const isReportFramed = (sentence: string, strict: boolean): boolean =>
  COMPLETION.test(sentence) ||
  PAST_REPORT.test(sentence) ||
  SET_ORDINAL.test(sentence) ||
  (strict &&
    (LAST_SET.test(sentence) || PAST_STATEMENT.test(sentence) || STRICT_PAST_REPORT.test(sentence) || THATS_A_COUNT.test(sentence)));

const isWeaklyFramed = (sentence: string): boolean =>
  (PAST_STATEMENT.test(sentence) || THATS_A_COUNT.test(sentence)) &&
  !STRICT_PAST_REPORT.test(sentence) &&
  !COMPLETION.test(sentence) &&
  !PAST_REPORT.test(sentence) &&
  !SET_ORDINAL.test(sentence) &&
  !LAST_SET.test(sentence);

const PRONOUN_ONE =
  /\b(?:that|this|the|last|next|each|every|another|which|no|any|some|a\s+good|a\s+hard|an\s+easy)\s+one\b|\bone\s+(?:more|of\s+(?:them|those|these))\b/gi;

const extractReportedSet = (
  raw: string,
  units: SetReportUnits,
  strict = false,
): (ParsedSet & { weak?: boolean }) | null => {
  const source = strict
    ? raw.replace(LAST_SET, (m) => m.replace(/\bone\b/i, 'set')).replace(/\b(last|final)\s+set\s*[:,-]?\s*(?=\d)/gi, '$1 set: ')
    : raw;
  const candidates = splitSentences(normalizeSpokenNumbers(source.replace(PRONOUN_ONE, ' '))).filter(
    (sentence) =>
      !sentence.endsWith('?') &&
      isReportFramed(sentence, strict) &&
      !NEGATED.test(sentence) &&
      !PAST_CONTEXT.test(sentence) &&
      !((FUTURE_INTENT.test(sentence) || (strict && STRICT_FUTURE_INTENT.test(sentence))) && !COMPLETION.test(sentence)),
  );

  for (const sentence of candidates.reverse()) {
    const moved = strict ? sentence.match(MOVED_WEIGHT) : null;
    const weightMatch = moved ? null : sentence.match(WEIGHT_WITH_UNIT);
    const plural = moved || weightMatch ? null : sentence.match(/\bthe\s+(\d+)s\b/i);
    const bareMatch = !moved && !weightMatch && !plural ? sentence.match(strict ? BARE_WEIGHT_STRICT : BARE_WEIGHT) : null;
    const weight = moved
      ? toKg(Number(moved[1]), moved[2] ?? null, units)
      : weightMatch
        ? toKg(Number(weightMatch[1]), weightMatch[2], units)
        : plural
          ? toKg(Number(plural[1]), null, units)
          : bareMatch
            ? toKg(Number(bareMatch[1]), null, units)
            : null;

    const numbers = (bareMatch || moved ? sentence.replace((bareMatch ?? moved)![0], ' ') : sentence)
      .replace(WEIGHT_WITH_UNIT, ' ')
      .replace(/\b\d+s\b/gi, ' ')
      .replace(SET_ORDINAL_PATTERN, ' ')
      .replace(NOT_A_REP_COUNT, ' ')
      .match(/\b\d+\b/g);

    if (!numbers || numbers.length !== 1) continue;
    const reps = Number(numbers[0]);
    if (!Number.isInteger(reps) || reps < 2 || reps > 100) continue;
    return strict && isWeaklyFramed(sentence) ? { weight, reps, weak: true } : { weight, reps };
  }
  return null;
};

export const classifySpokenSet = (
  raw: string,
  units: SetReportUnits = 'metric',
  context: SpokenSetContext = { awaitingDetails: false },
): SpokenSetIntent => {
  const text = straightenQuotes(raw).trim();
  if (!text) return { kind: 'ignore' };
  if (context.awaitingDetails && context.confirmsBareReps) {
    const answer = normalizeSpokenNumbers(text).trim().replace(/[.!?]+$/, '').trim().match(/^(\d{1,3})(?:\s*reps?)?$/i);
    const reps = answer ? Number(answer[1]) : NaN;
    if (reps >= 1 && reps <= 100) return { kind: 'log', set: { weight: null, reps } };
  }
  if (!context.typed && isCounting(text)) {
    const single = isBareRepCount(text);
    const bareCountAsks =
      !context.legacy && isStrict(context.version) && !!context.confirmsBareReps && !context.resting && !context.timedExercise;
    return single !== null && single >= 2 && bareCountAsks
      ? { kind: 'unconfirmed', set: { weight: null, reps: single } }
      : { kind: 'ignore' };
  }

  const legacy = !!context.legacy;
  const strict = !legacy && isStrict(context.version);
  const completed = legacy ? LEGACY_COMPLETION.test(text) : COMPLETION.test(withoutNegatedCompletion(text));
  const reported =
    !!context.confirmed ||
    completed ||
    PAST_REPORT.test(text) ||
    SET_ORDINAL.test(text) ||
    (strict &&
      (PAST_STATEMENT.test(text) ||
        LAST_SET.test(text) ||
        STRICT_PAST_REPORT.test(text) ||
        SET_ORDINAL.test(normalizeSpokenNumbers(text))));
  const intended =
    !completed && ((legacy ? LEGACY_FUTURE_INTENT : FUTURE_INTENT).test(text) || (strict && STRICT_FUTURE_INTENT.test(text)));
  if (strict && !completed && PAST_CONTEXT.test(text)) return { kind: 'ignore' };
  if (strict && !completed && !reported) {
    const aboutSpeech = SPEECH_REFERENCE.test(text);
    const change = parseWeightChangeRequest(text, units, context.version, { ignoreSetReport: aboutSpeech });
    if (change != null) return { kind: 'stated_weight', weight: change };
    if (aboutSpeech) return { kind: 'ignore' };
  }
  const asked = !legacy && text.endsWith('?');

  const parsed = parseSetReport(text, units, {
    allowPositional: context.typed ?? false,
    timedExercise: context.timedExercise,
    bareWeight: !legacy,
    version: context.version,
  });

  const holdsDuringRest =
    !!context.confirmsBareReps &&
    !!context.resting &&
    !context.typed &&
    !context.awaitingDetails &&
    context.exerciseHasLoggedSets !== false;
  const logOrHold = (set: ParsedSet): SpokenSetIntent =>
    holdsDuringRest ? { kind: 'unconfirmed', set } : { kind: 'log', set };

  if (parsed) {
    if (
      parsed.unit === 'seconds' &&
      !context.confirmed &&
      !reported &&
      (context.version ?? SET_PARSER_VERSION) >= DURATION_INSTRUCTIONS_FROM_VERSION &&
      (DURATION_INSTRUCTION.test(text) || REST_WORD.test(text) || /\b(?:more|extra|another|longer|shorter)\b/i.test(text))
    ) {
      return { kind: 'ignore' };
    }
    if (intended && !context.awaitingDetails) {
      const weight = parseStatedWeight(text, units, context.version);
      return weight != null ? { kind: 'stated_weight', weight } : { kind: 'ignore' };
    }
    if (asked && !context.awaitingDetails) return { kind: 'ignore' };
    if (strict && parsed.inferredWeight && !context.confirmed) {
      const { inferredWeight: _inferred, ...set } = parsed;
      return { kind: 'unconfirmed', set };
    }
    if (strict && !context.awaitingDetails && !reported && parsed.unit !== 'seconds') {
      return { kind: 'unconfirmed', set: parsed };
    }
    const explicitPair = parsed.weight !== null && parsed.unit !== 'seconds';
    if (reported || context.awaitingDetails || explicitPair || parsed.unit === 'seconds' || context.typed) {
      return logOrHold(parsed);
    }
    if (!context.confirmsBareReps || legacy) return { kind: 'ignore' };
    return logOrHold(parsed);
  }

  if (!legacy && !context.timedExercise) {
    const loose = extractReportedSet(text, units, strict);
    if (loose) {
      const { weak, ...set } = loose;
      return weak && !context.confirmed && !context.awaitingDetails ? { kind: 'unconfirmed', set } : logOrHold(set);
    }
    if (strict && completed) {
      const joined = extractReportedSet(text.replace(/[.!]+\s+(?=\S)/g, ', '), units, strict);
      if (joined && !joined.weak) return logOrHold({ weight: joined.weight, reps: joined.reps });
    }
  }

  if (completed) return { kind: 'needs_details' };

  const weight = parseStatedWeight(text, units, context.version);
  if (weight != null) return { kind: 'stated_weight', weight };
  return { kind: 'ignore' };
};

export const looksLikeFinishedSetReport = (text: string): boolean => {
  const raw = straightenQuotes(text).trim();
  if (!raw || isCounting(raw)) return false;
  if (COMPLETION.test(withoutNegatedCompletion(raw))) return true;
  return extractReportedSet(raw, 'metric') !== null;
};

export const hasSetCompletionSignal = (text: string): boolean => {
  return COMPLETION.test(withoutNegatedCompletion(straightenQuotes(text)));
};

export const describesPlannedSet = (text: string): boolean => {
  const raw = straightenQuotes(text);
  return !COMPLETION.test(withoutNegatedCompletion(raw)) && FUTURE_INTENT.test(raw) && extractReportedSet(raw, 'metric') === null;
};

const SET_NUMBER_WORD = /(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)/.source;

const START_SET_PATTERNS = [
  new RegExp(
    `^(?:let'?s\\s+)?(?:go|start|begin|do|move)(?:ing)?\\s*(?:on\\s+)?(?:to\\s+)?(?:the\\s+)?(?:next\\s+)?(?:set)?\\s*(?:${SET_NUMBER_WORD})?$`,
  ),
  new RegExp(`^(?:i'?m\\s+)?(?:ready|done)(?:\\s+(?:for|with)\\s+(?:the\\s+)?(?:next\\s+)?(?:set|rest)\\s*(?:${SET_NUMBER_WORD})?)?$`),
  new RegExp(`^(?:next\\s+set|set\\s+(?:${SET_NUMBER_WORD}))$`),
  /^(?:skip|end|stop|cut|kill)\s+(?:the\s+)?rest$/,
  /^rest\s+(?:is\s+)?(?:done|over|finished)$/,
];

const START_SET_LEAD = /^(?:(?:ok(?:ay)?|alright|all\s+right|right|yeah|yep|yes|so|and|hey|cool|good|great|well|um+|uh+)\b[\s.,!?]*)+/;

const START_SET_TAIL = /[\s.,!?]*\b(?:now|please|already|then|too|man|bro|coach|go\s+ahead|i\s+guess|ok(?:ay)?|alright|yeah|yep)\b[\s.,!?]*$/;

const stripStartSetTail = (text: string): string => {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const trimmed = out.replace(START_SET_TAIL, '').trim();
    if (trimmed === out) break;
    out = trimmed;
  }
  return out.replace(/[.!?,]+$/g, '').trim();
};

const READY_OR_DONE_PATTERN = 1;

export const looksLikeStartSetCommand = (raw: string): boolean => {
  const normalized = straightenQuotes(raw).trim().toLowerCase().replace(/[.!?,]+$/g, '').trim();
  if (!normalized) return false;
  const matches = (text: string, skipReadyOrDone: boolean): boolean =>
    START_SET_PATTERNS.some((pattern, i) => (skipReadyOrDone && i === READY_OR_DONE_PATTERN ? false : pattern.test(text)));
  if (matches(normalized, false)) return true;
  const tailless = stripStartSetTail(normalized);
  if (tailless && tailless !== normalized && matches(tailless, false)) return true;
  const stripped = stripStartSetTail(normalized.replace(START_SET_LEAD, '').trim());
  if (!stripped || stripped === normalized) return false;
  return matches(stripped, true);
};

export const AFFIRMATION = /\b(yes|yeah|yep|yup|correct|that['\u2019]?s right|right|confirm(?:ed)?|i did|sure|affirmative)\b/i;

export const NEGATION = /\b(no|nope|nah|wrong|incorrect|didn['\u2019]?t|not right)\b/i;

export const isNegation = (text: string): boolean => NEGATION.test(straightenQuotes(text));

export const confirmsSetDone = (raw: string): boolean => {
  const text = straightenQuotes(raw);
  if (isNegation(text)) return false;
  return isAffirmation(text) || COMPLETION.test(withoutNegatedCompletion(text));
};

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

export const parseLoadSchemeKg = (scheme: string | null | undefined): number | null => {
  if (!scheme) return null;
  const kg = LOAD_KG.exec(scheme);
  if (kg) return Number(kg[1]);
  const lb = LOAD_LB.exec(scheme);
  if (lb) return Math.round(Number(lb[1]) * 0.453592 * 10) / 10;
  return null;
};

export const isImplausibleWeightJump = (
  next: number | null | undefined,
  reference: number | null | undefined,
): boolean => {
  if (next == null || reference == null) return false;
  if (next <= 0 || reference <= 0) return false;
  const ratio = next / reference;
  return ratio < LOW_RATIO || ratio > HIGH_RATIO;
};

const LOAD_RANGE = /\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?\s*(?:kgs?|kilos?|kilogrammes?|kilograms?|lbs?|pounds?)\b|%|\brpe\b|\brir\b/i;

export const plannedWeightKg = (scheme: string | null | undefined): number | null => {
  if (!scheme || LOAD_RANGE.test(scheme)) return null;
  return parseLoadSchemeKg(scheme);
};

export interface KnownWeights {
  lastLogged: number | null;
  stated: number | null;
  planned: number | null;
  statedIsNewer?: boolean;
}

export const resolveReportedWeight = (set: ParsedSet, known: KnownWeights): number | null => {
  if (set.unit === 'seconds' || set.weight !== null) return set.weight;
  if (known.statedIsNewer && known.stated !== null) return known.stated;
  return known.lastLogged ?? known.stated ?? known.planned ?? null;
};

export interface CorrectionTarget {
  weight: number | null;
  reps: number;
  unit?: 'seconds';
}

export type SetCorrection =
  | { kind: 'correction'; weight?: number | null; reps?: number }
  | { kind: 'unclear' };

const STRONG_CORRECTION_CUE =
  /\b(?:meant|should\s+(?:be|have\s+been|'?ve\s+been|read|say)|supposed\s+to\s+be|wrong|incorrect|correct(?:ion|ed)?|fix|typo|instead\s+of|change\s+(?:it|that|this|the\s+(?:last\s+)?(?:set|weight|reps?|one)|set|my\s+last\s+set|last\s+set)\s+to|make\s+(?:it|that|this|the\s+last\s+set|last\s+set)\s+\d+|mis(?:heard|typed|logged|read))\b|\bnot\s+(?:\w+\s+){0,2}\d/i;

const WEAK_CORRECTION_CUE = /\bactually\b/i;

const NOT_ABOUT_A_SET =
  /\b(?:rest|rests|resting|timer|break)\b|(?<![\d.])\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|sets?|more|left|to\s+go)\b|\b\d{1,2}:\d{2}\b|\b(?:next|last)\s+(?:time|week|session|workout)\b/i;

const RESTING_CORRECTION_CUE =
  /\b(?:wait|oops|sorry|hold\s+on|hang\s+on|whoops)\b|\b(?:that|it)\s+was\s+only\b|\bonly\s+(?:got|did|managed|hit)\b/i;

const hasCorrectionCue = (text: string, resting: boolean): boolean =>
  STRONG_CORRECTION_CUE.test(text) ||
  (WEAK_CORRECTION_CUE.test(text) && !COMPLETION.test(withoutNegatedCompletion(text)) && !PAST_REPORT.test(text)) ||
  (resting && RESTING_CORRECTION_CUE.test(text) && !COMPLETION.test(withoutNegatedCompletion(text)) && !text.endsWith('?'));

const CORRECTION_SUBJECT = /\b(?:set|weight|reps?|lbs?|pounds?|kgs?|kilos?|logged|says|shows|saved|recorded)\b/i;

const SET_REFERENCE = /\bsets?\s*#?\s*\d+\b|\b(?:first|second|third|fourth|fifth|\d+(?:st|nd|rd|th))\s+set\b/i;

const CORRECTION_NUMBER = /(?<![\d.])(\d+(?:\.\d+)?)(?![\d.]\d)\s*(kilogrammes?|kilograms?|kgs?|kilos?|pounds?|lbs?|reps?)?/gi;

const WRONG_MARKER = /\b(?:not|instead\s+of)\b/i;

interface NumberToken {
  value: number;
  unit: string | null;
  index: number;
}

const displayWeight = (kg: number, units: SetReportUnits): number =>
  units === 'imperial' ? kgToLb(kg) : Math.round(kg * 10) / 10;

const closeTo = (a: number, b: number): boolean => Math.abs(a - b) <= Math.max(0.6, Math.abs(b) * 0.02);

export const detectSetCorrection = (
  raw: string,
  units: SetReportUnits,
  last: CorrectionTarget | null,
  version?: number,
  options: { resting?: boolean } = {},
): SetCorrection | null => {
  if (!last || !isStrict(version) || last.unit === 'seconds') return null;
  const text = normalizeSpokenNumbers(straightenQuotes(raw).replace(PRONOUN_ONE, ' ')).trim();
  if (!hasCorrectionCue(text, !!options.resting)) return null;
  if (NOT_ABOUT_A_SET.test(text)) return null;
  if (SPEECH_REFERENCE.test(text)) return null;
  if (SET_REFERENCE.test(text) || NEGATED_COMPLETION.test(text)) {
    NEGATED_COMPLETION.lastIndex = 0;
    return null;
  }
  NEGATED_COMPLETION.lastIndex = 0;
  if (FUTURE_INTENT.test(text) && !/\b(?:said|meant|typed|was|logged|says|shows)\b/i.test(text)) return null;

  const tokens: NumberToken[] = [...text.matchAll(CORRECTION_NUMBER)].map((m) => ({
    value: Number(m[1]),
    unit: m[2] ? m[2].toLowerCase() : null,
    index: m.index ?? 0,
  }));
  const bodyweight = /\b(?:body\s*weight|no\s+weight|unweighted)\b/i.exec(text);

  const wrongAt = text.search(WRONG_MARKER);
  let right: NumberToken[] = tokens;
  let wrong: NumberToken | null = null;
  let rightBodyweight = !!bodyweight;
  if (wrongAt >= 0) {
    const before = tokens.filter((t) => t.index < wrongAt);
    const after = tokens.filter((t) => t.index > wrongAt);
    if (before.length > 0 || (bodyweight && bodyweight.index < wrongAt)) {
      right = before;
      wrong = after[0] ?? null;
      rightBodyweight = !!bodyweight && bodyweight.index < wrongAt;
    } else {
      wrong = after[0] ?? null;
      right = after.slice(1);
      rightBodyweight = !!bodyweight && bodyweight.index > wrongAt;
    }
  }

  const lastWeightShown = last.weight != null ? displayWeight(last.weight, units) : null;
  const isRepsUnit = (unit: string | null) => !!unit && /^reps?$/.test(unit);
  const isWeightUnit = (unit: string | null) => !!unit && !isRepsUnit(unit);

  const kindOf = (token: NumberToken): 'weight' | 'reps' | null => {
    if (isRepsUnit(token.unit)) return 'reps';
    if (isWeightUnit(token.unit)) return 'weight';
    if (wrong) {
      if (isRepsUnit(wrong.unit)) return 'reps';
      if (isWeightUnit(wrong.unit)) return 'weight';
      if (lastWeightShown != null && closeTo(wrong.value, lastWeightShown)) return 'weight';
      if (wrong.value === last.reps) return 'reps';
    }
    if (!Number.isInteger(token.value)) return 'weight';
    if (lastWeightShown == null) return 'reps';
    const toWeight = Math.abs(token.value - lastWeightShown) / lastWeightShown;
    const toReps = Math.abs(token.value - last.reps) / Math.max(1, last.reps);
    return toWeight <= toReps ? 'weight' : 'reps';
  };

  const correction: { weight?: number | null; reps?: number } = {};
  if (rightBodyweight) correction.weight = null;
  for (const token of right) {
    const kind = kindOf(token);
    if (kind === 'reps' && correction.reps === undefined && Number.isInteger(token.value) && token.value >= 1 && token.value <= 100) {
      correction.reps = token.value;
    } else if (kind === 'weight' && correction.weight === undefined && token.value > 0 && token.value <= 1000) {
      correction.weight = toKg(token.value, isWeightUnit(token.unit) ? token.unit : null, units);
    }
  }

  if (correction.weight !== undefined || correction.reps !== undefined) return { kind: 'correction', ...correction };
  return CORRECTION_SUBJECT.test(text) ? { kind: 'unclear' } : null;
};

const REST_REQUEST =
  /^(?:(?:ok(?:ay)?|alright|now|and|so)[\s,]+)?(?:(?:i'?m\s+)?resting(?:\s+now)?|(?:(?:start|begin|starting)\s+(?:the\s+|my\s+|a\s+)?)?(?:rest|rest\s+timer|timer)(?:\s+(?:now|please|time|period|up))?|time\s+(?:to|for)\s+(?:a\s+)?rest|(?:take|taking)\s+(?:a\s+|my\s+)?rest)[\s.!]*$/i;

export const looksLikeRestRequest = (raw: string): boolean => REST_REQUEST.test(straightenQuotes(raw).trim());

const REST_QUERY =
  /^(?:(?:ok(?:ay)?|so|and|hey)[\s,]+)?(?:how\s+(?:long|much\s+(?:time|rest|longer))(?:\s+(?:is|do\s+i\s+have|have\s+i\s+got|'?s|was))?(?:\s+(?:left|remaining|to\s+go))?(?:\s+(?:on\s+(?:the\s+|my\s+)?)?(?:rest|timer|break))?(?:\s+(?:left|remaining))?|(?:rest\s+|time\s+)?(?:time\s+)?(?:left|remaining)|how\s+long\s+(?:until|till|before)\s+(?:the\s+)?next\s+set)[\s?.!]*$/i;

export const looksLikeRestQuery = (raw: string): boolean => REST_QUERY.test(straightenQuotes(raw).trim());

const UNDO_REQUEST =
  /^(?:please\s+)?(?:undo|remove|delete|scratch|cancel|take\s+(?:off|out))(?:\s+(?:that|the\s+last|last|my\s+last|this|the\s+previous))?(?:\s+(?:set|one|entry|log))?(?:\s+please)?[\s.!]*$/i;

const UNDO_LEAD =
  /^(?:(?:no|nope|wait|hang\s+on|hold\s+on|actually|sorry|oops|scratch\s+that|my\s+bad|uh|um|er|erm|okay|ok|hey|so)\b[\s.,!?]*)+/i;

const UNDO_NEGATED =
  /\b(?:can'?t|cannot|could\s*n'?t|do\s*n'?t|does\s*n'?t|did\s*n'?t|wo\s*n'?t|would\s*n'?t|never|unable\s+to|no\s+way\s+to)\s+(?:\w+\s+){0,2}(?:undo|remove|delete|scratch|cancel)\b/i;

const UNDO_PHRASE =
  /\b(?:undo|scratch)\s+(?:that|it|this|the\s+last|last|my\s+last|the\s+previous)(?:\s+(?:set|one|entry|log))?\b|\b(?:remove|delete|cancel)\s+(?:that|the\s+last|my\s+last|the\s+previous|last)\s*(?:set|one|entry|log)?\b|\btake\s+(?:that|the\s+last|my\s+last|last)\s*(?:set|one|entry)?\s+off\b|\b(?:undo|scratch|delete|remove)\s+(?:set\s*#?\s*\d+|the\s+\w+\s+set)\b/i;

const MISHEARD_UNDO =
  /^(?:a\s+new|and\s+do|undue|un\s+do|and\s+to|a\s+do|hand\s+do|i\s+knew|until|till|til|under|unto|into|in\s+to|and\s+you)\s+(?:the\s+|my\s+|that\s+)?last\s+(?:set|one)\b[\s.,!?]*$/i;

export const looksLikeMisheardUndo = (raw: string): boolean =>
  MISHEARD_UNDO.test(straightenQuotes(raw).trim().replace(UNDO_LEAD, '').trim());

const DID_NOT_DO_SET =
  /\b(?:i\s+(?:did\s*n[o']?t|didnt|never)\s+(?:actually\s+)?(?:do|finish|complete)\s+(?:that|this|the\s+last|it))\b/i;

export const looksLikeUndoRequest = (raw: string): boolean => {
  const text = straightenQuotes(raw).trim();
  if (!text) return false;
  if (UNDO_NEGATED.test(text)) return false;
  if (UNDO_REQUEST.test(text)) return true;
  if (DID_NOT_DO_SET.test(text)) return true;
  if (UNDO_PHRASE.test(text)) return true;
  const clauses = text.split(/[.;!?]+/).map((part) => part.trim()).filter(Boolean);
  return clauses.some((clause) => UNDO_REQUEST.test(clause.replace(UNDO_LEAD, '').trim()));
};

export const REST_WORD = /\b(?:rest|rests|resting\s+time|rest\s+time|rest\s+period|timer|break)\b/i;
const REST_CHANGE_BY = /\b(?:extend|add|more|another|extra|longer|shorter|less|by|skip|pause|resume|stop|end)\b/i;
const REST_DESIRE =
  /\b(?:supposed\s+to\s+be|should\s+be|should\s+have\s+been|meant\s+to\s+be|want(?:ed)?(?:\s+it)?|make\s+(?:it|my\s+rests?|the\s+rests?|rests?|all\s+rests?)|set\s+(?:it|my\s+rests?|the\s+rests?|rests?|the\s+timer|timer)\s+(?:to|at|for)|change\s+(?:it|my\s+rests?|the\s+rests?|rests?)\s+to|(?:rest|rests|timer|rest\s+time|rest\s+period)\s+(?:to|at|of|for|=|is|should\s+be)|give\s+me|i\s+(?:want|need|like))\s*$/i;

const REST_DESIRE_ANYWHERE =
  /\b(?:supposed\s+to\s+be|should\s+be|should\s+have\s+been|meant\s+to\s+be|want|make\s+(?:it|my\s+rests?|the\s+rests?|rests?)|set\s+(?:it|my\s+rests?|the\s+rests?|rests?|the\s+timer|timer)|change\s+(?:it|my\s+rests?|the\s+rests?|rests?)|give\s+me|i\s+need)\b/i;

const DURATION_PATTERN =
  /(?<![\d.:])(\d{1,2}):(\d{2})(?![\d:])|(?<![\d.])(\d+(?:\.\d+)?)\s*(minutes?|mins?|m\b|seconds?|secs?|s\b)(?:\s*(?:and\s+)?(\d{1,2})\s*(?:seconds?|secs?|s\b))?|\b(a|one)\s+(minute|min)\b(?:\s*(?:and\s+)?(?:a\s+)?(half))?/gi;

interface DurationToken {
  seconds: number;
  index: number;
}

const durationsIn = (text: string): DurationToken[] =>
  [...text.matchAll(DURATION_PATTERN)].map((m) => {
    const index = m.index ?? 0;
    if (m[1] !== undefined) return { seconds: Number(m[1]) * 60 + Number(m[2]), index };
    if (m[3] !== undefined) {
      const value = Number(m[3]);
      const minutes = /^m/i.test(m[4]);
      return { seconds: Math.round(minutes ? value * 60 + Number(m[5] ?? 0) : value), index };
    }
    return { seconds: m[8] ? 90 : 60, index };
  });

export const REST_REQUEST_MIN_SEC = 15;
export const REST_REQUEST_MAX_SEC = 600;

export const REST_EXTEND_MAX_SEC = 300;

export const parseRestLengthRequest = (raw: string): number | null => {
  const text = normalizeSpokenNumbers(straightenQuotes(raw)).trim();
  const newTotal = /\b(?:longer|shorter)\s+(?:rests?|break|timer)\b,?\s+(?:like|of|to|at|around|about|say)\s/i.test(text);
  if (!REST_WORD.test(text) || (REST_CHANGE_BY.test(text) && !(newTotal && !/\b(?:by|more|another|extra|add|extend)\b/i.test(text)))) return null;
  if (/\bonly\b/i.test(text) && !REST_DESIRE_ANYWHERE.test(text)) return null;
  if (/\?\s*$/.test(text) && !/\b(?:can|could)\s+(?:you\s+(?:make|set|change)|i\s+(?:get|have|do|take))\b/i.test(text)) return null;
  const durations = durationsIn(text);
  if (durations.length === 0) return null;
  const desired = durations.find((d) => REST_DESIRE.test(text.slice(0, d.index)));
  const chosen = desired ?? (durations.length === 1 ? durations[0] : null);
  if (!chosen) return null;
  return chosen.seconds >= REST_REQUEST_MIN_SEC && chosen.seconds <= REST_REQUEST_MAX_SEC ? chosen.seconds : null;
};

export type RestChangeRequest =
  | { kind: 'set'; seconds: number; scope: RestLengthScope }
  | { kind: 'extend'; seconds: number };

const REST_SCOPE_ALWAYS =
  /\b(?:always|every\s+time|each\s+time|(?:in|for)\s+(?:the\s+)?future|future\s+workouts?|next\s+time|every\s+(?:single\s+)?workout|all\s+(?:my\s+)?(?:future\s+)?workouts|save\s+(?:it|that|this)|remember\s+(?:it|that|this)|by\s+default|as\s+(?:my|the)\s+default)\b/i;
const REST_SCOPE_WORKOUT =
  /\b(?:(?:all|every|each)\s+(?:of\s+)?(?:my\s+|the\s+)?(?:rests?|breaks?|exercises?|movements?|lifts?)|(?:for|across|in)\s+(?:the\s+)?(?:rest\s+of\s+)?(?:the|this|my|today'?s)\s+(?:whole\s+|entire\s+)?(?:workout|session)|(?:whole|entire)\s+(?:workout|session)|everything|across\s+the\s+board)\b/i;
const REST_SCOPE_CURRENT =
  /\b(?:(?:just|only)\s+(?:for\s+)?(?:this|the\s+current)\s+(?:rest|break|one|time)|(?:this|the\s+current)\s+(?:rest|break|one|time)\s+only|just\s+(?:this\s+once|once|for\s+now)|(?:make|set|change)\s+(?:this|the\s+current)\s+(?:rest|break)|this\s+rest\s+(?:to|at|for|should|is)|only\s+this\s+(?:rest|break|one|time))\b/i;
const REST_SET_WITHOUT_REST_WORD =
  /^(?:(?:ok(?:ay)?|actually|hey|coach|um+|uh+|so|and|alright|yeah|yes|no)[\s,]+)*(?:(?:can|could)\s+you\s+|please\s+|let'?s\s+)?(?:always\s+|from\s+now\s+on\s+)?(?:(?:make|set|change|put|bump|drop)\s+(?:it|that|this|this\s+one|the\s+timer|timer)|use|go\s+with|keep\s+(?:it|that)(?:\s+at)?)\s+(?:to\s+|at\s+|for\s+|up\s+to\s+|down\s+to\s+)?(?:like\s+|about\s+|around\s+)?$/i;
const REST_EXTEND_MARKER = /\b(?:add|adding|extend|another|extra)\b|\bmore\s+(?:rest|time)\b|\b(?:seconds?|secs?|minutes?|mins?)\s+more\b/i;
const REST_NOT_EXTEND =
  /\b(?:don'?t|do\s+not|no\s+need|never|shorter|less|reduce|cut|take\s+(?:off|away)|remove|minus)\b|\bi\s+(?:did|held|got|managed|went|hit|lasted|was)\b|\bheld\b|\bholding\b/i;

const normalizeRestDurations = (text: string): string =>
  text
    .replace(/(\d+(?:\.\d+)?)\s+(?:more|extra)\s+(seconds?|secs?|minutes?|mins?)\b/gi, '$1 $2 more')
    .replace(/\b(?:another|an\s+extra|one\s+more|one\s+extra|extra)\s+(minute|min)\b/gi, 'a $1 more');

const isRestQuestion = (text: string): boolean =>
  /\?\s*$/.test(text) && !/\b(?:can|could)\s+(?:you\s+(?:make|set|change|add|give|extend)|i\s+(?:get|have|do|take))\b/i.test(text);

const restScopeOf = (text: string): RestLengthScope | null => {
  const always = REST_SCOPE_ALWAYS.test(text);
  const workout = REST_SCOPE_WORKOUT.test(text);
  const current = REST_SCOPE_CURRENT.test(text);
  if ([always, workout, current].filter(Boolean).length > 1) return null;
  if (always) return 'always';
  if (workout) return 'workout';
  if (current) return 'current';
  return 'exercise';
};

export const HOLD_TARGET_MIN_SEC = 5;
export const HOLD_TARGET_MAX_SEC = 600;

export const parseHoldTargetRequest = (raw: string): number | null => {
  const text = normalizeRestDurations(normalizeSpokenNumbers(straightenQuotes(raw)).trim());
  if (!text || isRestQuestion(text) || REST_WORD.test(text)) return null;
  if (!DURATION_INSTRUCTION.test(text) || REST_EXTEND_MARKER.test(text)) return null;
  const durations = durationsIn(text);
  if (durations.length !== 1) return null;
  const seconds = durations[0].seconds;
  return seconds >= HOLD_TARGET_MIN_SEC && seconds <= HOLD_TARGET_MAX_SEC ? seconds : null;
};

export const parseRestChangeRequest = (
  raw: string,
  context: { resting: boolean; timedExercise?: boolean },
): RestChangeRequest | null => {
  const text = normalizeRestDurations(normalizeSpokenNumbers(straightenQuotes(raw)).trim());
  if (!text || isRestQuestion(text)) return null;
  const mentionsRest = REST_WORD.test(text);

  if (REST_EXTEND_MARKER.test(text) && !REST_NOT_EXTEND.test(text) && (context.resting || mentionsRest)) {
    const durations = durationsIn(text);
    if (durations.length !== 1) return null;
    const seconds = durations[0].seconds;
    return seconds >= 5 && seconds <= REST_EXTEND_MAX_SEC ? { kind: 'extend', seconds } : null;
  }

  const withoutDefault = (value: string) => value.replace(/\bby\s+default\b/gi, ' ');
  let seconds = parseRestLengthRequest(withoutDefault(raw));
  if (
    seconds === null &&
    !mentionsRest &&
    !REST_CHANGE_BY.test(withoutDefault(text)) &&
    (context.resting || REST_SCOPE_ALWAYS.test(text) || context.timedExercise === false)
  ) {
    const durations = durationsIn(text);
    if (durations.length === 1 && REST_SET_WITHOUT_REST_WORD.test(text.slice(0, durations[0].index))) {
      const value = durations[0].seconds;
      seconds = value >= REST_REQUEST_MIN_SEC && value <= REST_REQUEST_MAX_SEC ? value : null;
    }
  }
  if (seconds === null) return null;
  const scope = restScopeOf(text);
  return scope ? { kind: 'set', seconds, scope } : null;
};

export const isBareRepCount = (raw: string): number | null => {
  const text = normalizeSpokenNumbers(straightenQuotes(raw)).trim().replace(/[.!]+$/g, '').trim();
  const match = text.match(/^(\d{1,3})$/);
  if (!match) return null;
  const reps = Number(match[1]);
  return reps >= 1 && reps <= 100 ? reps : null;
};
