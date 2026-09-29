import { addDaysToKey, weekdayOfKey } from './training-schedule.ts';

export type DayPhraseResult = { dateKey: string } | { error: 'unclear' | 'out_of_range' };

export const DAY_RANGE_PAST = 60;
export const DAY_RANGE_FUTURE = 180;

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const SMALL_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
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
};

const ORDINAL_UNITS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const ORDINAL_WORDS: Record<string, number> = {
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  thirtieth: 30,
};

const ordinalWordsToDigits = (text: string): string =>
  text
    .replace(
      new RegExp(`\\b(twenty|thirty)[-\\s]+(${ORDINAL_UNITS.join('|')})\\b`, 'g'),
      (_, tens: string, unit: string) => `${(tens === 'twenty' ? 20 : 30) + ORDINAL_UNITS.indexOf(unit) + 1}th`,
    )
    .replace(new RegExp(`\\b(${Object.keys(ORDINAL_WORDS).join('|')})\\b`, 'g'), (word: string) => `${ORDINAL_WORDS[word]}th`)
    .replace(new RegExp(`\\b(${ORDINAL_UNITS.join('|')})\\b`, 'g'), (word: string) => `${ORDINAL_UNITS.indexOf(word) + 1}th`);

const normalize = (raw: string | null | undefined): string =>
  ordinalWordsToDigits(
    String(raw ?? '')
      .toLowerCase()
      .replace(/[‘’]/g, "'"),
  );

const MONTH_NAME = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const WEEKDAY_NAME = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');

const pad = (n: number): string => String(n).padStart(2, '0');

const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

const validKey = (year: number, month: number, day: number): string | null =>
  month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? `${year}-${pad(month)}-${pad(day)}` : null;

const daysBetween = (fromKey: string, toKey: string): number =>
  Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);

const nextWeekday = (todayKey: string, weekday: number, allowToday: boolean): string => {
  const diff = (weekday - weekdayOfKey(todayKey) + 7) % 7;
  return addDaysToKey(todayKey, diff === 0 && !allowToday ? 7 : diff);
};

const monthDay = (todayKey: string, month: number, day: number, explicitYear: number | null): string | null => {
  const thisYear = Number(todayKey.slice(0, 4));
  if (explicitYear !== null) return validKey(explicitYear, month, day);
  const candidate = validKey(thisYear, month, day);
  if (!candidate) return null;
  return daysBetween(todayKey, candidate) < -DAY_RANGE_PAST ? validKey(thisYear + 1, month, day) : candidate;
};

const nearestDayOfMonthOnWeekday = (todayKey: string, day: number, weekday: number): string | null => {
  const y = Number(todayKey.slice(0, 4));
  const m = Number(todayKey.slice(5, 7));
  const candidates = [-1, 0, 1]
    .map((shift) => {
      const month = ((m - 1 + shift + 12) % 12) + 1;
      const year = y + Math.floor((m - 1 + shift) / 12);
      return validKey(year, month, day);
    })
    .filter((key): key is string => !!key && weekdayOfKey(key) === weekday)
    .sort((a, b) => Math.abs(daysBetween(todayKey, a)) - Math.abs(daysBetween(todayKey, b)));
  return candidates[0] ?? null;
};

const parse = (text: string, todayKey: string): string | null => {
  if (text === '' || /^(?:today|tonight|now|this\s+(?:morning|afternoon|evening))$/.test(text)) return todayKey;
  if (/^(?:tomorrow|tmrw|tmr|tomorow|tommorow|tommorrow)$/.test(text)) return addDaysToKey(todayKey, 1);
  if (/^(?:the\s+)?day\s+after\s+tomorrow$/.test(text)) return addDaysToKey(todayKey, 2);
  if (/^yesterday$/.test(text)) return addDaysToKey(todayKey, -1);
  if (/^(?:the\s+)?day\s+before\s+yesterday$/.test(text)) return addDaysToKey(todayKey, -2);

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return validKey(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const inDays = text.match(/^(?:in\s+)?(\d+|[a-z]+)\s+(day|days|week|weeks)(?:\s+from\s+(?:now|today))?$/);
  if (inDays && (/^in\s/.test(text) || /from\s+(?:now|today)$/.test(text))) {
    const n = /^\d+$/.test(inDays[1]) ? Number(inDays[1]) : SMALL_NUMBERS[inDays[1]];
    if (n === undefined) return null;
    return addDaysToKey(todayKey, /^week/.test(inDays[2]) ? n * 7 : n);
  }

  const ago = text.match(/^(\d+|[a-z]+)\s+(day|days|week|weeks)\s+ago$/);
  if (ago) {
    const n = /^\d+$/.test(ago[1]) ? Number(ago[1]) : SMALL_NUMBERS[ago[1]];
    if (n === undefined) return null;
    return addDaysToKey(todayKey, -(/^week/.test(ago[2]) ? n * 7 : n));
  }

  if (/^(?:this\s+|the\s+|next\s+)?weekend$/.test(text)) return nextWeekday(todayKey, 6, true);

  const last = text.match(new RegExp(`^(?:on\\s+)?(?:last|past|previous)\\s+(${WEEKDAY_NAME})$`));
  if (last) {
    const back = (weekdayOfKey(todayKey) - WEEKDAYS[last[1]] + 7) % 7;
    return addDaysToKey(todayKey, -(back === 0 ? 7 : back));
  }

  const weekdayWithDate = text.match(new RegExp(`^(?:on\\s+)?(?:this\\s+|next\\s+|last\\s+)?(${WEEKDAY_NAME}),?\\s+(.+)$`));
  if (weekdayWithDate && /\d/.test(weekdayWithDate[2])) {
    const target = WEEKDAYS[weekdayWithDate[1]];
    const rest = weekdayWithDate[2];
    const dayOnly = rest.match(/^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?$/);
    if (dayOnly) return nearestDayOfMonthOnWeekday(todayKey, Number(dayOnly[1]), target);
    return parse(rest, todayKey);
  }

  const weekday = text.match(new RegExp(`^(?:(this|next|coming|on|the)\\s+)?(?:(this|next|coming)\\s+)?(${WEEKDAY_NAME})(?:\\s+(next\\s+week|after\\s+next))?$`));
  if (weekday) {
    const qualifier = weekday[2] ?? weekday[1] ?? null;
    const target = WEEKDAYS[weekday[3]];
    let key = nextWeekday(todayKey, target, qualifier === null || qualifier === 'this' || qualifier === 'on' || qualifier === 'the');
    if (weekday[4] === 'next week') {
      const mondayNextWeek = addDaysToKey(todayKey, 7 - ((weekdayOfKey(todayKey) + 6) % 7));
      key = addDaysToKey(mondayNextWeek, (target + 6) % 7);
    } else if (weekday[4] === 'after next') {
      key = addDaysToKey(nextWeekday(todayKey, target, false), 7);
    }
    return key;
  }

  const year = (value: string | undefined): number | null => (value ? Number(value.length === 2 ? `20${value}` : value) : null);

  const monthFirst = text.match(
    new RegExp(`^(?:on\\s+)?(${MONTH_NAME})\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`),
  );
  if (monthFirst) return monthDay(todayKey, MONTHS[monthFirst[1]], Number(monthFirst[2]), year(monthFirst[3]));

  const dayFirst = text.match(
    new RegExp(`^(?:on\\s+)?(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAME})\\.?(?:,?\\s+(\\d{4}))?$`),
  );
  if (dayFirst) return monthDay(todayKey, MONTHS[dayFirst[2]], Number(dayFirst[1]), year(dayFirst[3]));

  const numeric = text.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?$/);
  if (numeric) {
    const [first, second] = [Number(numeric[1]), Number(numeric[2])];
    return first > 12 && second <= 12
      ? monthDay(todayKey, second, first, year(numeric[3]))
      : monthDay(todayKey, first, second, year(numeric[3]));
  }

  const ordinalOnly = text.match(/^(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)?$|^(\d{1,2})(?:st|nd|rd|th)$/);
  if (ordinalOnly) {
    const day = Number(ordinalOnly[1] ?? ordinalOnly[2]);
    const y = Number(todayKey.slice(0, 4));
    const m = Number(todayKey.slice(5, 7));
    const thisMonth = validKey(y, m, day);
    if (thisMonth && thisMonth >= todayKey) return thisMonth;
    return m === 12 ? validKey(y + 1, 1, day) : validKey(y, m + 1, day);
  }

  return null;
};

export const resolveDayPhrase = (raw: string | null | undefined, todayKey: string): DayPhraseResult => {
  const text = normalize(raw)
    .replace(/[?!.,]+$/g, '')
    .replace(/'s$/, '')
    .replace(/\bof\s+this\s+month\b/g, '')
    .replace(/\s+(?:morning|afternoon|evening|night)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const dateKey = parse(text, todayKey);
  if (!dateKey) return { error: 'unclear' };
  const offset = daysBetween(todayKey, dateKey);
  if (offset < -DAY_RANGE_PAST || offset > DAY_RANGE_FUTURE) return { error: 'out_of_range' };
  return { dateKey };
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const describeDayKey = (dateKey: string, todayKey: string): string => {
  const offset = daysBetween(todayKey, dateKey);
  const label = `${WEEKDAY_LABELS[weekdayOfKey(dateKey)]}, ${MONTH_LABELS[Number(dateKey.slice(5, 7)) - 1]} ${Number(dateKey.slice(8, 10))}`;
  if (offset === 0) return `Today (${label})`;
  if (offset === 1) return `Tomorrow (${label})`;
  if (offset === -1) return `Yesterday (${label})`;
  return label;
};

export const shortDayLabel = (dateKey: string, todayKey: string): string => {
  const offset = daysBetween(todayKey, dateKey);
  if (offset === 0) return 'Today';
  if (offset === 1) return 'Tomorrow';
  return `${WEEKDAY_LABELS[weekdayOfKey(dateKey)].slice(0, 3)}, ${MONTH_LABELS[Number(dateKey.slice(5, 7)) - 1]} ${Number(dateKey.slice(8, 10))}`;
};

const SPOKEN_WEEKDAY = '(?:sunday|monday|tuesday|tues|wednesday|thursday|thurs|friday|saturday)';
const DAY_NUMBER = '\\d{1,2}(?:st|nd|rd|th)?';
const NOT_A_DATE_AFTER =
  '(?!\\s*(?:set|sets|rep|reps|exercise|exercises|round|rounds|one|ones|time|times|week|weeks|day|days|lift|lifts|move|attempt|try|pound|pounds|lb|lbs|kg|kilo|kilos|minute|minutes|second|seconds|place|meal|workout|session)\\b)';

const MENTION_PATTERNS: RegExp[] = [
  /\b(?:the\s+)?day\s+(?:after\s+tomorrow|before\s+yesterday)\b/g,
  /\b(?:tomorrow|tmrw|yesterday)\b/g,
  new RegExp(
    `\\b(?:(?:this|next|last|coming|past|previous)\\s+)?${SPOKEN_WEEKDAY}\\b` +
      `(?:,?\\s+(?:the\\s+)?${DAY_NUMBER}\\b(?:\\s+of\\s+(?:${MONTH_NAME})\\b)?${NOT_A_DATE_AFTER}` +
      `|,?\\s+(?:${MONTH_NAME})\\.?\\s+(?:the\\s+)?${DAY_NUMBER}\\b` +
      `|\\s+(?:next\\s+week|after\\s+next)\\b)?`,
    'g',
  ),
  new RegExp(`\\b(?:the\\s+)?${DAY_NUMBER}\\s+(?:of\\s+)?(?:${MONTH_NAME})\\b(?:,?\\s+\\d{4})?`, 'g'),
  new RegExp(`\\b(?:${MONTH_NAME})\\.?\\s+(?:the\\s+)?${DAY_NUMBER}\\b${NOT_A_DATE_AFTER}(?:,?\\s+\\d{4})?`, 'g'),
  new RegExp(`\\b(?:on|for|by|until|till)\\s+the\\s+\\d{1,2}(?:st|nd|rd|th)\\b${NOT_A_DATE_AFTER}`, 'g'),
  /\b(?:in\s+(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?)|(?:\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:days?|weeks?)\s+(?:from\s+(?:now|today)|ago))\b/g,
];

export interface DayMention {
  phrase: string;
  dateKey: string;
}

export const findDayMentions = (raw: string | null | undefined, todayKey: string, limit = 3): DayMention[] => {
  const text = normalize(raw);
  const found: { index: number; phrase: string }[] = [];
  for (const pattern of MENTION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      found.push({ index: match.index ?? 0, phrase: match[0].replace(/^(?:on|for|by|until|till)\s+/, '').trim() });
    }
  }
  const mentions: DayMention[] = [];
  const covered: [number, number][] = [];
  for (const { index, phrase } of found.sort((a, b) => a.index - b.index || b.phrase.length - a.phrase.length)) {
    const end = index + phrase.length;
    if (covered.some(([from, to]) => index < to && end > from)) continue;
    const resolved = resolveDayPhrase(phrase, todayKey);
    if (!('dateKey' in resolved) || resolved.dateKey === todayKey) continue;
    covered.push([index, end]);
    if (!mentions.some((m) => m.dateKey === resolved.dateKey)) mentions.push({ phrase, dateKey: resolved.dateKey });
    if (mentions.length >= limit) break;
  }
  return mentions;
};
