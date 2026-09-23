import { BRAIN_TOOLS } from './brain-tools.ts';

const INTERNAL_PHRASES = [
  'live session state',
  'session state block',
  'state block',
  'context block',
  'system note',
  'system cue',
  'tool call',
  'tool calls',
  'function call',
  'confirm token',
  'confirmation token',
  'dynamic variable',
  'system prompt',
];

const TOOL_REFERENCE = /\b(?:my|the|this|that|its|our)\s+(?:\w+\s+){0,2}tools?\b/i;

const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

const TOOL_NAMES = new Set<string>(BRAIN_TOOLS.map((tool) => tool.name));

const phrasePattern = new RegExp(
  `\\b(?:${INTERNAL_PHRASES.map((p) => p.replace(/\s+/g, '\\s+')).join('|')})\\b`,
  'i',
);

export function looksInternal(sentence: string): boolean {
  const snake = sentence.match(SNAKE_CASE);
  if (snake && (TOOL_NAMES.has(snake[0]) || snake[0].includes('_'))) return true;
  return phrasePattern.test(sentence) || TOOL_REFERENCE.test(sentence);
}

const splitSentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

export function scrubInternalLanguage(text: string): string {
  if (!text?.trim()) return text;
  const sentences = splitSentences(text);
  if (sentences.length === 0) return text;

  const kept = sentences.filter((sentence) => !looksInternal(sentence));
  if (kept.length === sentences.length) return text;

  const scrubbed = kept.join(' ').trim();
  if (!scrubbed) {
    console.error('[scrub-internal] every sentence read as internal, passing through:', text);
    return text;
  }
  console.error('[scrub-internal] dropped internal language from a reply:', text);
  return scrubbed;
}
