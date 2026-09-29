import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateConversationTitle } from '../_shared/conversation-title.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Missing Authorization header' }, 401);

    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userError } = await db.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: 'Invalid or expired session' }, 401);

    const { data: due, error: claimError } = await db.rpc('conversation_claim_titles', { p_limit: 8 });
    if (claimError) throw new Error(`claim: ${claimError.message}`);

    const outcomes = await Promise.all(
      (due ?? []).map(async ({ conversation_id: id, visible_count: count }: { conversation_id: string; visible_count: number }) => {
        try {
          const { data: messages, error } = await db
            .from('message')
            .select('role, content, modality, at')
            .eq('conversation_id', id)
            .eq('hidden', false)
            .order('at', { ascending: true })
            .limit(400);
          if (error) throw new Error(error.message);
          const named = await generateConversationTitle(messages ?? []);
          if (!named) return false;
          const { error: applyError } = await db.rpc('conversation_apply_title', {
            p_id: id,
            p_title: named.title,
            p_tags: named.tags,
            p_count: count,
          });
          if (applyError) throw new Error(applyError.message);
          return true;
        } catch (err) {
          console.error(`[conversation-titles] ${id}:`, err instanceof Error ? err.message : err);
          return false;
        }
      }),
    );

    return json({ updated: outcomes.filter(Boolean).length, considered: outcomes.length });
  } catch (err) {
    console.error('[conversation-titles] error:', err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
