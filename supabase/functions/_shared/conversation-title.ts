export type TitleTag = 'meal' | 'workout' | 'recovery' | 'profile';

export interface TitleMessage {
  role: string;
  content: string | null;
  modality?: string | null;
}

export interface ConversationTitle {
  title: string;
  tags: TitleTag[];
}

const TITLE_TAGS: TitleTag[] = ['meal', 'workout', 'recovery', 'profile'];
const HEAD_MESSAGES = 10;
const TAIL_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 240;
const MAX_TRANSCRIPT_CHARS = 9000;
const MAX_TITLE_CHARS = 60;

export const TITLE_TOOL = {
  name: 'name_conversation',
  description: 'Record the title and topics for this conversation.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '2 to 6 words, sentence case, naming what was actually discussed or done.',
      },
      tags: {
        type: 'array',
        items: { type: 'string', enum: [...TITLE_TAGS, 'general'] },
        description: 'Every topic that came up. Use general only when none of the others apply.',
      },
    },
    required: ['title', 'tags'],
  },
};

export const TITLE_SYSTEM_PROMPT = [
  'You name chat conversations between a user and their AI fitness coach, for the history list in the app.',
  'Write a short, specific title that tells the user what this conversation was about, like "Swapped legs for shoulders", "Knee pain and hamstring stretch" or "Logged lunch and dinner".',
  'Rules for the title: 2 to 6 words, sentence case, no quotes, no emoji, no dashes, no trailing punctuation, no names, never generic words alone like "Chat" or "Conversation".',
  'Tags, pick every one that applies: meal (food, meals, macros, nutrition), workout (training, exercises, sets, the plan, schedule), recovery (pain, injury, soreness, sleep, stretching, rest), profile (weight, body stats, goals, personal details), general (only if nothing else fits).',
  'Always answer by calling name_conversation.',
].join('\n');

const speakerFor = (message: TitleMessage): string =>
  message.role === 'user' ? 'User' : message.modality === 'app' ? 'App' : 'Coach';

const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

export const buildTitleTranscript = (messages: TitleMessage[]): string => {
  const usable = messages
    .map((m) => ({ ...m, content: (m.content ?? '').replace(/\s+/g, ' ').trim() }))
    .filter((m) => m.content.length > 0 && !m.content.startsWith('[[SYSTEM_CUE]]'));
  const picked =
    usable.length > HEAD_MESSAGES + TAIL_MESSAGES
      ? [...usable.slice(0, HEAD_MESSAGES), null, ...usable.slice(-TAIL_MESSAGES)]
      : usable;
  const lines = picked.map((m) => (m ? `${speakerFor(m)}: ${clip(m.content, MAX_MESSAGE_CHARS)}` : '…'));
  let transcript = lines.join('\n');
  while (transcript.length > MAX_TRANSCRIPT_CHARS && lines.length > 2) {
    lines.splice(Math.floor(lines.length / 2), 1);
    transcript = lines.join('\n');
  }
  return transcript;
};

export const sanitizeTitle = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/[—–]/g, ' ')
    .replace(/["“”`]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .replace(/[.!?,;:]+$/, '')
    .trim();
  if (!cleaned || /^(chat|conversation|untitled|general)$/i.test(cleaned)) return null;
  const capped = clip(cleaned, MAX_TITLE_CHARS);
  return capped.charAt(0).toUpperCase() + capped.slice(1);
};

export const sanitizeTags = (raw: unknown): TitleTag[] =>
  Array.isArray(raw)
    ? [...new Set(raw.filter((t): t is TitleTag => TITLE_TAGS.includes(t as TitleTag)))].sort()
    : [];

export const parseTitleResponse = (content: unknown): ConversationTitle | null => {
  if (!Array.isArray(content)) return null;
  const call = content.find((block: any) => block?.type === 'tool_use' && block?.name === TITLE_TOOL.name);
  const title = sanitizeTitle(call?.input?.title);
  if (!title) return null;
  return { title, tags: sanitizeTags(call?.input?.tags) };
};

export const generateConversationTitle = async (
  messages: TitleMessage[],
  fetchImpl: typeof fetch = fetch,
): Promise<ConversationTitle | null> => {
  const transcript = buildTitleTranscript(messages);
  if (!transcript) return null;
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: Deno.env.get('TITLE_MODEL') ?? 'claude-haiku-4-5',
      max_tokens: 200,
      system: TITLE_SYSTEM_PROMPT,
      tools: [TITLE_TOOL],
      tool_choice: { type: 'tool', name: TITLE_TOOL.name },
      messages: [{ role: 'user', content: `Conversation:\n${transcript}` }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return parseTitleResponse(body?.content);
};
