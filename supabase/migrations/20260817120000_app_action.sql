create table app_action (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz
);

create index app_action_user_pending_idx on app_action (user_id, created_at) where consumed_at is null;

alter table app_action enable row level security;

create policy select_own on app_action for select to authenticated
  using (auth.uid() = user_id);

create policy ack_own on app_action for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter publication supabase_realtime add table app_action;
