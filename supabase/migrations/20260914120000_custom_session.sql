-- Two things the coach needed in order to honour "swap today's rest day for an Arms workout"
-- without lying about having done it.
--
-- 1. The catalog had no direct arm work at all (nor calves, nor lateral raises, nor pull-ups).
--    Every plan handler rejects an exercise name that isn't in `exercise`, so an arms-focused
--    session was not merely unbuilt — it was unbuildable, and the model's only options were to
--    fail or to invent. Keep in sync with supabase/functions/_shared/exercise-catalog.ts.
insert into exercise (name, movement_pattern, primary_muscles, contraindicated_for) values
  ('Pull-up', 'pull', '{lats,biceps}', '{}'),
  ('Dumbbell Row', 'pull', '{back,lats}', '{}'),
  ('Barbell Curl', 'isolation', '{biceps}', '{deep_elbow_flexion_loaded}'),
  ('Dumbbell Curl', 'isolation', '{biceps}', '{deep_elbow_flexion_loaded}'),
  ('Hammer Curl', 'isolation', '{biceps,forearms}', '{deep_elbow_flexion_loaded}'),
  ('Cable Tricep Pushdown', 'isolation', '{triceps}', '{loaded_elbow_extension}'),
  ('Overhead Tricep Extension', 'isolation', '{triceps}', '{loaded_elbow_extension,overhead_press}'),
  ('Tricep Dip', 'push', '{triceps,chest}', '{loaded_elbow_extension}'),
  ('Lateral Raise', 'isolation', '{shoulders}', '{}'),
  ('Calf Raise', 'isolation', '{calves}', '{}'),
  ('Hanging Knee Raise', 'core', '{core}', '{}')
on conflict (name) do nothing;

-- 2. A one-off session for a single date, overriding whatever the plan (or a rest day) says is
--    due. Deliberately NOT a change to the training plan: the user asked for a different workout
--    today, not a different program, and update_training_plan would have replaced the whole thing.
--
--    The session itself is a perfectly ordinary plan_session + plan_exercise pair, so Preview,
--    Active Session, set logging and the session report all work on it unmodified. What keeps it
--    out of the weekly schedule is its parent training_plan row, which carries status 'custom':
--    every existing query filters on status = 'active', so the rotation, the weekly-schedule
--    description and show_plan_breakdown all skip it for free.
create table day_override (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade,
  date            date not null,
  plan_session_id uuid not null references plan_session on delete cascade,
  reason          text,
  created_at      timestamptz not null default now(),
  unique (user_id, date)
);

alter table day_override enable row level security;

create policy own_rows on day_override for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index day_override_user_date_idx on day_override (user_id, date desc);

-- Plan row + session + exercises + the override, committed together. Split across separate
-- inserts, a failure partway through would leave an orphaned session with no override pointing at
-- it (invisible, undeletable through the app) or — worse — an override pointing at a session whose
-- exercises never landed, which is an empty workout the user can still tap Start on.
create or replace function write_custom_session(
  p_user_id uuid,
  p_focus text,
  p_date date,
  p_exercises jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_plan_id      uuid;
  v_session_id   uuid;
  v_exercise     jsonb;
  v_ord          int := 0;
  v_old_plan_ids uuid[];
begin
  -- Asking twice for the same day replaces, it does not accumulate. Collected before anything is
  -- written; the delete happens at the end so a failure mid-build can't destroy the existing
  -- session without producing its replacement. Only ever touches 'custom' plans — a real plan
  -- session reached by an override (a swap, not a custom build) must survive untouched.
  select array_agg(ps.plan_id)
    into v_old_plan_ids
    from day_override d
    join plan_session ps on ps.id = d.plan_session_id
    join training_plan tp on tp.id = ps.plan_id
   where d.user_id = p_user_id and d.date = p_date and tp.status = 'custom';

  insert into training_plan (user_id, status, split, days_per_week)
  values (p_user_id, 'custom', p_focus, 1)
  returning id into v_plan_id;

  -- weekday null and day_order 0: it is never part of a rotation, and nothing resolves it by
  -- weekday. The day_override row is the only thing that makes it due, on exactly one date.
  insert into plan_session (plan_id, user_id, day_order, weekday, focus)
  values (v_plan_id, p_user_id, 0, null, p_focus)
  returning id into v_session_id;

  for v_exercise in select * from jsonb_array_elements(p_exercises)
  loop
    insert into plan_exercise (session_id, user_id, exercise_id, ord, sets, rep_scheme, load_scheme)
    values (
      v_session_id,
      p_user_id,
      (v_exercise->>'exercise_id')::uuid,
      v_ord,
      (v_exercise->>'sets')::int,
      v_exercise->>'rep_scheme',
      v_exercise->>'load_scheme'
    );
    v_ord := v_ord + 1;
  end loop;

  -- An override outranks a rest day, so this isn't strictly needed to make the session resolve —
  -- but leaving the row behind means Calendar paints the day as both a rest day and a workout.
  delete from rest_day where user_id = p_user_id and date = p_date;

  insert into day_override (user_id, date, plan_session_id, reason)
  values (p_user_id, p_date, v_session_id, 'coach_custom_session')
  on conflict (user_id, date)
    do update set plan_session_id = excluded.plan_session_id,
                  reason          = excluded.reason,
                  created_at      = now();

  -- Now that the override points at the new session, the superseded custom plan is unreachable.
  -- Deleting it cascades through plan_session and plan_exercise.
  if v_old_plan_ids is not null then
    delete from training_plan where id = any(v_old_plan_ids) and user_id = p_user_id and status = 'custom';
  end if;

  -- The whole point of this tool is that the coach may only claim success once the session really
  -- exists. Prove it rather than assume it: an override with no exercises behind it is a workout
  -- the user can tap Start on and find empty.
  if not exists (select 1 from plan_exercise where session_id = v_session_id) then
    raise exception 'write_custom_session: no exercises were written for session %', v_session_id;
  end if;

  return v_session_id;
end;
$$;

grant execute on function write_custom_session(uuid, text, date, jsonb) to service_role;

-- 3. Which session Home's once-a-day greeting was actually written about.
--
--    The greeting is generated once per day and cached by re-reading the last hidden assistant
--    message, but the only freshness checks were "same calendar day", "no workout logged since"
--    and "plan not rebuilt since" — none of which notice today's due session simply resolving to
--    something else. Confirmed live: the headline read "Upper Pull tonight — Deadlift, Lat
--    Pulldown, Seated Row, Face Pull" while the session chip immediately below it said "LOWER,
--    4 exercises". Two confident, contradictory answers on one screen.
--
--    Creating a custom session for today makes this strictly worse (it changes what's due
--    mid-day, by design), so the invariant needs to be structural rather than another heuristic:
--    a cached greeting is only reusable when the session it was written about is still the one
--    that's due. Holds a plan_session id, or 'rest' for a greeting written about a rest day.
alter table message
  add column greeting_key text;

comment on column message.greeting_key is
  'For Home''s daily greeting only: the plan_session id the greeting was generated about, or '
  '''rest'' if it was written for a rest day. Home refuses to reuse a cached greeting whose key '
  'no longer matches today''s resolved session, which is what stops the headline and the session '
  'chip disagreeing. Null on every other message.';
