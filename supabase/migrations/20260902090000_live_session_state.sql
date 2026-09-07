-- Live in-progress workout session state, written by the client on every structural change
-- (exercise/set/rest transition) and read by brain-voice on every turn so the live coaching
-- conversation gets the same ground-truth state text chat already receives via
-- src/lib/brain.ts's liveSessionState param. One row per user; the previous row is simply
-- overwritten, and it's deleted when a session truly ends (see ActiveSessionContext.clear()).
create table live_session_state (
  user_id    uuid primary key references auth.users on delete cascade,
  state      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table live_session_state enable row level security;

create policy select_own on live_session_state for select to authenticated
  using (auth.uid() = user_id);

create policy upsert_own on live_session_state for insert to authenticated
  with check (auth.uid() = user_id);

create policy update_own on live_session_state for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy delete_own on live_session_state for delete to authenticated
  using (auth.uid() = user_id);
