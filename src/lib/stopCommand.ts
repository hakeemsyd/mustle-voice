import { straightenQuotes } from '../../supabase/functions/_shared/set-report';

const STOP_PHRASES = new Set([
  'stop',
  'stop talking',
  'bye',
  'goodbye',
  'bye bye',
  'hang up',
  'quiet',
  'be quiet',
  'close',
  "that's all",
  "that'll be all",
]);

const LEADING_FILLER_WORDS = new Set(['ok', 'okay', 'alright', 'so', 'well', 'please']);

export const isStopCommand = (raw: string): boolean => {
  const text = straightenQuotes(raw);
  const clauses = text
    .toLowerCase()
    .split(/[.!?]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  const last = clauses[clauses.length - 1];
  if (!last) return false;

  let words = last.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
  while (words.length > 1 && LEADING_FILLER_WORDS.has(words[0])) {
    words = words.slice(1);
  }
  return STOP_PHRASES.has(words.join(' '));
};
