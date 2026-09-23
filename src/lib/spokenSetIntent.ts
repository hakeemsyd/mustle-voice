import { parseSetReport, parseStatedWeight, type ParsedSet } from './parseSetReport';
import { normalizeSpokenNumbers } from '../onboarding/normalizeSpokenNumbers';
import type { Units } from './units';

export type SpokenSetIntent =
  | { kind: 'ignore' }
  | { kind: 'stated_weight'; weight: number }
  | { kind: 'needs_details' }
  | { kind: 'log'; set: ParsedSet };

export interface SpokenSetContext {
  awaitingDetails: boolean;
  timedExercise?: boolean;
}

const COMPLETION =
  /\b(done|complete|completed|finished|that'?s\s+it|that\s+was\s+it|racked|logged\s+it|in\s+the\s+bank)\b/i;

const PAST_REPORT = /\b(did|got|hit|managed|knocked\s+out|banged\s+out|pushed\s+out|squeezed\s+out|ended\s+up|only\s+got)\b/i;

const SET_ORDINAL =
  /\b(?:sets?\s*#?\s*\d+|\d+(?:st|nd|rd|th)\s+set|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+set)\b/i;

const FUTURE_INTENT =
  /\b(gonna|going\s+to|i'?ll|let'?s|plan(?:ning)?\s+to|about\s+to|start(?:ing)?\s+with|i'?m\s+using|im\s+using|using|i'?m\s+on|aiming|try(?:ing)?\s+for|shoot(?:ing)?\s+for|next\s+set|this\s+set|target)\b/i;

const isCounting = (raw: string): boolean => {
  const bare = normalizeSpokenNumbers(raw)
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();
  return /^\d+(?:\s*[,and]*\s*\d+)*$/i.test(bare);
};

export function classifySpokenSet(
  raw: string,
  units: Units = 'metric',
  context: SpokenSetContext = { awaitingDetails: false },
): SpokenSetIntent {
  const text = raw.trim();
  if (!text) return { kind: 'ignore' };
  if (isCounting(text)) return { kind: 'ignore' };

  const completed = COMPLETION.test(text);
  const reported = completed || PAST_REPORT.test(text) || SET_ORDINAL.test(text);
  const intended = !completed && FUTURE_INTENT.test(text);

  const parsed = parseSetReport(text, units, {
    allowPositional: false,
    timedExercise: context.timedExercise,
  });

  if (parsed) {
    if (intended && !context.awaitingDetails) {
      const weight = parseStatedWeight(text, units);
      return weight != null ? { kind: 'stated_weight', weight } : { kind: 'ignore' };
    }
    const explicitPair = parsed.weight !== null && parsed.unit !== 'seconds';
    if (reported || context.awaitingDetails || explicitPair || parsed.unit === 'seconds') {
      return { kind: 'log', set: parsed };
    }
    return { kind: 'ignore' };
  }

  if (completed) return { kind: 'needs_details' };

  const weight = parseStatedWeight(text, units);
  if (weight != null) return { kind: 'stated_weight', weight };
  return { kind: 'ignore' };
}
