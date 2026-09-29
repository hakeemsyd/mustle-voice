import { supabase } from './supabase';

export type ConversationTag = 'meal' | 'workout' | 'recovery' | 'profile' | 'general';

export const CONVERSATION_TAGS: ConversationTag[] = ['meal', 'workout', 'recovery', 'profile', 'general'];

export interface ConversationSummary {
  id: string;
  kind: 'general' | 'workout';
  title: string;
  tags: ConversationTag[];
  primaryTag: ConversationTag;
  at: string;
  startedAt: string;
}

let pinQueue: Promise<unknown> = Promise.resolve();

const inOrder = <T>(run: () => Promise<T>): Promise<T> => {
  const next = pinQueue.then(run, run);
  pinQueue = next.catch(() => undefined);
  return next;
};

export const enterConversation = (conversationId: string | null = null): Promise<string | null> =>
  inOrder(async () => {
    const { data, error } = await supabase.rpc('conversation_enter', { p_conversation_id: conversationId });
    if (error) {
      console.error('[conversations] enter failed:', error.message);
      return conversationId;
    }
    return (data as string | null) ?? null;
  });

export const leaveConversation = (): Promise<void> =>
  inOrder(async () => {
    const { error } = await supabase.rpc('conversation_leave');
    if (error) console.error('[conversations] leave failed:', error.message);
  });

const TITLE_REFRESH_INTERVAL_MS = 20_000;
let lastTitleRefreshAt = 0;
let titleRefresh: Promise<number> | null = null;

export const refreshConversationTitles = (): Promise<number> => {
  if (titleRefresh) return titleRefresh;
  if (Date.now() - lastTitleRefreshAt < TITLE_REFRESH_INTERVAL_MS) return Promise.resolve(0);
  lastTitleRefreshAt = Date.now();
  titleRefresh = supabase.functions
    .invoke('conversation-titles', { body: {} })
    .then(({ data, error }) => {
      if (error) {
        console.error('[conversations] title refresh failed:', error.message);
        return 0;
      }
      return typeof data?.updated === 'number' ? data.updated : 0;
    })
    .catch((err) => {
      console.error('[conversations] title refresh failed:', err);
      return 0;
    })
    .finally(() => {
      titleRefresh = null;
    });
  return titleRefresh;
};

const toTags = (raw: unknown, kind: ConversationSummary['kind']): ConversationTag[] => {
  const known = (Array.isArray(raw) ? raw : []).filter((t): t is ConversationTag =>
    CONVERSATION_TAGS.includes(t as ConversationTag),
  );
  const withKind = kind === 'workout' && !known.includes('workout') ? ['workout' as const, ...known] : known;
  return withKind.length > 0 ? withKind : ['general'];
};

export const toConversationSummary = (row: any): ConversationSummary => {
  const kind: ConversationSummary['kind'] = row.kind === 'workout' ? 'workout' : 'general';
  const tags = toTags(row.tags, kind);
  return {
    id: row.id,
    kind,
    title: row.title?.trim() || (kind === 'workout' ? 'Workout' : 'Conversation'),
    tags,
    primaryTag: kind === 'workout' ? 'workout' : CONVERSATION_TAGS.find((t) => tags.includes(t)) ?? 'general',
    at: row.last_message_at ?? row.started_at,
    startedAt: row.started_at,
  };
};

const startOfDay = (d: Date): number => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const conversationDateLabel = (iso: string): string => {
  const date = new Date(iso);
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: sameYear ? undefined : 'numeric' });
};
