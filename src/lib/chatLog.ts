import { supabase } from './supabase';
import { dispatchQuery } from './dispatchQuery';
import { APP_LINE_MODALITY } from '../../supabase/functions/_shared/replay-history';

export const persistChatLine = (userId: string | null, role: 'user' | 'coach', text: string): void => {
  const content = text.trim();
  if (!userId || !content) return;
  dispatchQuery(
    supabase.from('message').insert({
      user_id: userId,
      role: role === 'user' ? 'user' : 'assistant',
      content,
      modality: role === 'user' ? 'text' : APP_LINE_MODALITY,
      hidden: false,
      at: new Date().toISOString(),
    }),
    role === 'user' ? 'persist locally handled message' : 'persist app line',
  );
};
