-- Wraps archive-old-plan + insert-new-plan + insert-sessions + insert-exercises in a single
-- Postgres transaction. Previously this was several separate client-side inserts from the edge
-- function — a failure partway through (e.g. a dropped connection after archiving the old plan
-- but before the new one finished) could leave a user with no active plan at all.
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
begin
  update training_plan set status = 'archived' where user_id = p_user_id and status = 'active';

  insert into training_plan (user_id, split, days_per_week)
  values (p_user_id, p_plan->>'split', (p_plan->>'days_per_week')::int)
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

grant execute on function write_training_plan(uuid, jsonb) to service_role;
