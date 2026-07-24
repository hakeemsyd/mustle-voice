-- Mustle v1 — coaching brain schema.
-- Everything user-owned is protected by RLS: a user can only ever read/write their own rows.
-- The exercise catalog is global (read-only to authenticated users). See docs/coaching-brain.md.

create extension if not exists pgcrypto;

-- ---------- enums ----------
create type goal_objective as enum ('cut', 'bulk', 'recomp', 'maintain');
create type injury_status  as enum ('active', 'resolved');
create type source_modality as enum ('voice', 'text', 'image', 'file', 'live_photo');
create type msg_role as enum ('user', 'assistant', 'system');

-- ---------- profile (1:1 with auth.users) ----------
create table profile (
  user_id     uuid primary key references auth.users on delete cascade,
  display_name text,
  unit_prefs  text not null default 'metric',   -- 'metric' | 'imperial'
  timezone    text,
  created_at  timestamptz not null default now()
);

-- ---------- goal (current) + history ----------
create table goal (
  user_id     uuid primary key references auth.users on delete cascade,
  objective   goal_objective not null,
  target_rate text,                              -- e.g. "-0.5kg/wk"
  note        text,
  updated_at  timestamptz not null default now()
);

create table goal_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  objective  goal_objective not null,
  note       text,
  changed_at timestamptz not null default now()
);

-- ---------- biometrics ----------
create table biometrics (
  user_id  uuid primary key references auth.users on delete cascade,
  sex      text,
  dob      date,
  height_cm numeric,
  activity_level text                            -- sedentary..very_active
);

create table weight_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  weight_kg  numeric not null,
  measured_at timestamptz not null default now()
);

-- ---------- injuries (the hard-constraint source) ----------
create table injury (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  area      text not null,                        -- 'left_knee', 'lumbar', 'right_shoulder'...
  status    injury_status not null default 'active',
  severity  text,
  note      text,
  created_at timestamptz not null default now()
);
create index injury_active_idx on injury (user_id) where status = 'active';

-- ---------- exercise catalog (global) ----------
create table exercise (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  movement_pattern text,                          -- squat, hinge, push, pull, carry...
  primary_muscles  text[] not null default '{}',
  -- tags the injury validator checks against active injuries:
  contraindicated_for text[] not null default '{}' -- e.g. {deep_knee_flexion_loaded, heavy_axial_load}
);

-- ---------- training plan ----------
create table training_plan (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  status      text not null default 'active',      -- 'active' | 'archived'
  split       text,
  days_per_week int,
  version     int not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table plan_session (
  id       uuid primary key default gen_random_uuid(),
  plan_id  uuid not null references training_plan on delete cascade,
  user_id  uuid not null references auth.users on delete cascade,  -- denormalized for RLS
  day_order int not null,
  weekday  int,                                    -- 0-6, nullable if flexible
  focus    text                                    -- 'legs', 'push'...
);

create table plan_exercise (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references plan_session on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,  -- denormalized for RLS
  exercise_id uuid not null references exercise,
  ord         int not null default 0,
  sets        int,
  rep_scheme  text,                                -- '8-10', 'AMRAP'...
  load_scheme text                                 -- '%1RM', 'RPE 8'...
);

-- ---------- nutrition targets ----------
create table nutrition_target (
  user_id   uuid primary key references auth.users on delete cascade,
  calories  int,
  protein_g int,
  carbs_g   int,
  fat_g     int,
  derived_from_goal goal_objective,
  updated_at timestamptz not null default now()
);

-- ---------- logs (silent, from conversation) ----------
create table food_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  at        timestamptz not null default now(),
  description text not null,
  calories  int, protein_g int, carbs_g int, fat_g int,
  modality  source_modality not null default 'text'
);

create table workout_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users on delete cascade,
  at        timestamptz not null default now(),
  plan_session_id uuid references plan_session on delete set null,
  exercises_done  jsonb not null default '[]',
  note      text
);

create table checkin_log (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users on delete cascade,
  at       timestamptz not null default now(),
  weight_kg numeric, mood int, sleep_hours numeric, soreness int,
  note     text
);

-- ---------- conversation / memory ----------
create table message (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users on delete cascade,
  role     msg_role not null,
  content  text not null,
  modality source_modality not null default 'text',
  at       timestamptz not null default now()
);
create index message_user_at_idx on message (user_id, at desc);

-- ---------- RLS: user-owned tables ----------
do $$
declare t text;
begin
  foreach t in array array[
    'profile','goal','goal_history','biometrics','weight_log','injury',
    'training_plan','plan_session','plan_exercise','nutrition_target',
    'food_log','workout_log','checkin_log','message'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy own_rows on %I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);',
      t
    );
  end loop;
end $$;

-- exercise catalog: global, read-only to authenticated users
alter table exercise enable row level security;
create policy exercise_read on exercise for select to authenticated using (true);
