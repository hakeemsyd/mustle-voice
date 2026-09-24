import type { TimeBand } from '../screens/homeFormat';

const OPENING_TIME_OF_DAY = /^(good\s+)?(morning|afternoon|evening)\b/i;

export const alignGreetingToTimeBand = (text: string, band: TimeBand): string => {
  const match = text.match(OPENING_TIME_OF_DAY);
  if (!match || match[2].toLowerCase() === band.toLowerCase()) return text;
  const rest = text.slice(match[0].length);
  if (band === 'Night') return `Hey${rest}`;
  return `${match[1] ? `Good ${band.toLowerCase()}` : band}${rest}`;
};
