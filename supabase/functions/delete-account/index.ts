import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Deleting an account is destructive and permanent, so the user to delete is resolved from the
// caller's own verified access token — never from a client-supplied id in the body — so this
// can only ever delete the account making the request. auth.admin.deleteUser requires the
// service role key; every table already cascades on auth.users being removed (see the initial
// schema migration's `references auth.users on delete cascade`), so this one call is enough to
// clear all of a user's data along with the account itself.
Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401 });
    }

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await callerClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401 });
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userData.user.id);
    if (deleteError) throw new Error(`delete user: ${deleteError.message}`);

    return new Response(JSON.stringify({ status: 'deleted' }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-account] error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
