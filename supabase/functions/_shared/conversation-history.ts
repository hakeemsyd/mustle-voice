export interface ConversationHistoryRequest {
  supabase: any;
  userId: string;
  at: Date;
  text: string;
  columns: string;
  limit: number;
  fallbackSince: string;
}

export interface EarlierMessage {
  content: string;
  at: string;
}

export interface ConversationHistory {
  data: any[] | null;
  error: { message: string } | null;
  scoped: boolean;
  earlier: EarlierMessage[];
}

const PIN_TTL_MS = 30 * 60 * 1000;

const EARLIER_LIMIT = 80;

const EARLIER_CHARS = 160;

const CUE_PREFIX = '[[SYSTEM_CUE]]';

const loadEarlierUserMessages = async (
  supabase: any,
  userId: string,
  conversationId: string,
  before: string,
): Promise<EarlierMessage[]> => {
  try {
    const { data, error } = await supabase
      .from('message')
      .select('content, at')
      .eq('user_id', userId)
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .eq('hidden', false)
      .lt('at', before)
      .order('at', { ascending: false })
      .limit(EARLIER_LIMIT);
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((m: any) => typeof m.content === 'string' && m.content.trim() && !m.content.startsWith(CUE_PREFIX))
      .map((m: any) => ({ content: String(m.content), at: String(m.at ?? '') }))
      .reverse();
  } catch {
    return [];
  }
};

export const describeEarlierInConversation = (earlier: EarlierMessage[]): string | null => {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const message of earlier) {
    const text = message.content.replace(/\s+/g, ' ').trim().slice(0, EARLIER_CHARS);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    lines.push(`- ${message.at.slice(0, 10)}: ${text}`);
  }
  if (lines.length === 0) return null;
  return (
    'Earlier in this conversation (older than the messages replayed below; the user\'s own words, oldest ' +
    `first; your replies from that part are not shown):\n${lines.join('\n')}\nIf they ask about this earlier ` +
    'part, answer from this list. Never say something was not mentioned in this conversation unless it is ' +
    'missing from both this list and the replayed messages.'
  );
};

export const resolveOpenedConversation = async (
  supabase: any,
  userId: string,
  at: Date,
  text: string,
): Promise<string | null> => {
  try {
    const { data, error } = await supabase.rpc('conversation_resolve', {
      p_user: userId,
      p_at: at.toISOString(),
      p_role: 'user',
      p_content: text,
      p_create: false,
    });
    if (error) {
      console.warn('[conversation-history] resolve failed, using the time window:', error.message);
      return null;
    }
    if (typeof data !== 'string' || data.length === 0) return null;
    const { data: row, error: rowError } = await supabase
      .from('conversation')
      .select('pinned_at')
      .eq('id', data)
      .maybeSingle();
    if (rowError || !row?.pinned_at) return null;
    return at.getTime() - new Date(row.pinned_at).getTime() < PIN_TTL_MS ? data : null;
  } catch (err) {
    console.warn('[conversation-history] resolve threw, using the time window:', err instanceof Error ? err.message : err);
    return null;
  }
};

export const loadConversationHistory = async ({
  supabase,
  userId,
  at,
  text,
  columns,
  limit,
  fallbackSince,
}: ConversationHistoryRequest): Promise<ConversationHistory> => {
  const opened = await resolveOpenedConversation(supabase, userId, at, text);
  const base = supabase.from('message').select(columns).eq('user_id', userId);
  const filtered = opened ? base.eq('conversation_id', opened) : base.gte('at', fallbackSince);
  const { data, error } = await filtered
    .order('at', { ascending: false })
    .order('role', { ascending: true })
    .limit(limit);
  const oldest = Array.isArray(data) && data.length >= limit ? data[data.length - 1]?.at : null;
  const earlier =
    opened && !error && typeof oldest === 'string' ? await loadEarlierUserMessages(supabase, userId, opened, oldest) : [];
  return { data, error, scoped: opened !== null, earlier };
};
