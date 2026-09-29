create table exercise_rest_preference (
  user_id     uuid not null references auth.users on delete cascade,
  exercise_id uuid not null references exercise on delete cascade,
  rest_sec    int not null check (rest_sec between 15 and 600),
  updated_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

alter table exercise_rest_preference enable row level security;

create policy own_rows on exercise_rest_preference for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table exercise_rest_preference is
  'A rest length the user asked to keep for one exercise in every workout ("always use 90 seconds for this exercise"). Read when a workout starts; an in-workout change for that exercise or for every exercise still overrides it for that workout only.';
