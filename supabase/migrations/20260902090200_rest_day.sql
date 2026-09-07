-- An explicit, user-chosen rest day — deliberately NOT a third workout_log.status value, since
-- every existing consumer of that column (streak, calendar, stats) treats a non-partial row as
-- "a workout happened," and a rest day must never pad those. unique(user_id, date) gives natural
-- upsert/idempotency for "choose rest day" being tapped or asked for twice.
create table rest_day (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  date            date not null,
  plan_session_id uuid references plan_session on delete set null,
  reason          text,
  created_at      timestamptz not null default now(),
  unique (user_id, date)
);

alter table rest_day enable row level security;

create policy own_rows on rest_day for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index rest_day_user_date_idx on rest_day (user_id, date desc);
