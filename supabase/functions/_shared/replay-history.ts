// Rebuilds the model-facing message array from stored conversation rows.
//
// A turn that used tools is stored as ONE assistant row whose `blocks` column holds the whole
// internal transcript (every tool_use turn and its tool_result reply). Replaying those blocks is
// what stops the model re-running mutations it already performed: without them it reads a history
// where it said "logged" but has no evidence it ever called the tool, and calls it again.

const REPLAY_RESULT_CAP = 4000;
const TRUNCATION_NOTE = '… [truncated]';

export interface StoredMessage {
  role: string;
  content: string | null;
  blocks?: unknown;
  hidden?: boolean | null;
  greeting_key?: string | null;
  modality?: string | null;
}

export const APP_LINE_MODALITY = 'app';

const GREETING_PROMPT_PREFIX = 'Say hello for the first time today';

export function isGreetingScaffold(row: StoredMessage): boolean {
  if (row.greeting_key) return true;
  return row.role === 'user' && row.hidden === true && (row.content ?? '').startsWith(GREETING_PROMPT_PREFIX);
}

function isToolResultTurn(content: unknown): boolean {
  return (
    Array.isArray(content) &&
    content.length > 0 &&
    content.every((block: any) => block?.type === 'tool_result')
  );
}

/** Read tools can return the entire plan; replaying that verbatim on every later turn would
 *  crowd the context for no benefit. Mutation results are tiny and survive untouched. */
function capToolResults(entry: any): any {
  if (!isToolResultTurn(entry?.content)) return entry;
  return {
    ...entry,
    content: entry.content.map((block: any) => {
      if (typeof block.content !== 'string' || block.content.length <= REPLAY_RESULT_CAP) return block;
      return { ...block, content: block.content.slice(0, REPLAY_RESULT_CAP) + TRUNCATION_NOTE };
    }),
  };
}

/** The model rejects a history that opens on anything but a real user turn, and a tool_result
 *  whose tool_use was trimmed away is malformed. Dropping whole leading entries until a plain
 *  user turn is reached is the only trim that can't produce either. */
function trimToValidStart(entries: any[]): any[] {
  let start = 0;
  while (start < entries.length) {
    const entry = entries[start];
    if (entry.role === 'user' && typeof entry.content === 'string' && entry.content.trim() !== '') break;
    start += 1;
  }
  return entries.slice(start);
}

export function replayHistory(rows: StoredMessage[]): any[] {
  const entries: any[] = [];

  for (const row of rows) {
    if (isGreetingScaffold(row) || row.modality === APP_LINE_MODALITY) continue;
    const blocks = row.blocks;
    if (row.role === 'assistant' && Array.isArray(blocks) && blocks.length > 0) {
      for (const entry of blocks) {
        if (entry && typeof entry === 'object' && 'role' in entry) entries.push(capToolResults(entry));
      }
      continue;
    }

    const content = row.content ?? '';
    if (content.trim() === '') continue;
    entries.push({ role: row.role === 'assistant' ? 'assistant' : 'user', content });
  }

  return coalesceAdjacentUserTurns(trimToValidStart(entries));
}

function coalesceAdjacentUserTurns(entries: any[]): any[] {
  const out: any[] = [];
  for (const entry of entries) {
    const prev = out[out.length - 1];
    const bothPlainUser =
      prev?.role === 'user' &&
      entry?.role === 'user' &&
      typeof prev.content === 'string' &&
      typeof entry.content === 'string';
    if (bothPlainUser) {
      out[out.length - 1] = { ...prev, content: `${prev.content}\n${entry.content}` };
      continue;
    }
    out.push(entry);
  }
  return out;
}
