alter table training_plan add column starts_on date;

create table consultation_progress (
  user_id    uuid primary key references auth.users on delete cascade,
  topics     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table consultation_progress enable row level security;

create policy own_rows on consultation_progress for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function write_training_plan(p_user_id uuid, p_plan jsonb)
returns uuid
language plpgsql
as $$
declare
  v_plan_id uuid;
  v_session jsonb;
  v_session_id uuid;
  v_exercise jsonb;
  v_ord int;
  v_prior_starts_on date;
begin
  select starts_on into v_prior_starts_on
  from training_plan where user_id = p_user_id and status = 'active';

  update training_plan set status = 'archived' where user_id = p_user_id and status = 'active';

  insert into training_plan (user_id, split, days_per_week, starts_on)
  values (
    p_user_id,
    p_plan->>'split',
    (p_plan->>'days_per_week')::int,
    coalesce((p_plan->>'starts_on')::date, v_prior_starts_on)
  )
  returning id into v_plan_id;

  for v_session in select * from jsonb_array_elements(p_plan->'sessions')
  loop
    insert into plan_session (plan_id, user_id, day_order, weekday, focus)
    values (
      v_plan_id,
      p_user_id,
      (v_session->>'day_order')::int,
      (v_session->>'weekday')::int,
      v_session->>'focus'
    )
    returning id into v_session_id;

    v_ord := 0;
    for v_exercise in select * from jsonb_array_elements(v_session->'exercises')
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
  end loop;

  return v_plan_id;
end;
$$;
