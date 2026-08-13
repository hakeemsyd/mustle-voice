-- Cardio sessions, per-exercise coaching notes, and post-workout feedback.
--
-- Switch Workout can turn a scheduled strength session into a cardio one, so both the
-- plan side and the log side need to say which kind they are. Cardio in v1 is timer +
-- activity label only — deliberately no distance/route/pace.

alter table plan_session
  add column session_type text not null default 'strength'
    check (session_type in ('strength', 'cardio')),
  add column cardio_activity text;

alter table workout_log
  add column session_type text not null default 'strength'
    check (session_type in ('strength', 'cardio')),
  add column cardio_activity text,
  add column duration_sec int,
  -- Set when Switch Workout replaced a scheduled session, so history can show the
  -- swap instead of silently losing what was originally planned.
  add column switched_from_session_id uuid references plan_session on delete set null,
  add column feedback_tags text[];

-- Per-exercise coaching notes — what the Guide sheet shows as "past coaching notes".
-- Written from the client whenever the coach answers a question while a given
-- exercise is the active one, so the history is real conversation, not authored content.
create table exercise_note (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  exercise_id uuid not null references exercise on delete cascade,
  note        text not null,
  at          timestamptz not null default now()
);

create index exercise_note_user_exercise_at_idx
  on exercise_note (user_id, exercise_id, at desc);

alter table exercise_note enable row level security;
create policy own_rows on exercise_note for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
