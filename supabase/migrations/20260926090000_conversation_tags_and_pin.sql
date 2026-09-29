alter table conversation drop column category;

alter table conversation
  add column tags text[] not null default '{}' check (tags <@ array['meal', 'workout', 'recovery', 'profile', 'general']),
  add column pinned_at timestamptz;

comment on column conversation.tags is
  'Topics this conversation touched, from the tools the coach actually ran in it (log_food -> meal, record_injury -> recovery, ...). A conversation can carry several. Empty means general.';
comment on column conversation.pinned_at is
  'Set while the user has this conversation open in Global Chat (conversation_enter), so what they type or say continues it. Cleared by conversation_leave; ignored after 30 minutes so a crashed app cannot hold it.';

create or replace function conversation_message_tags(p_role text, p_content text, p_blocks jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct tag order by tag), '{}')
  from (
    select case
      when b->>'name' in ('log_food', 'update_food', 'delete_food', 'show_nutrition_summary', 'update_nutrition_targets', 'generate_nutrition_targets')
        then 'meal'
      when b->>'name' in ('log_workout', 'skip_exercise', 'swap_exercise', 'end_workout', 'add_set', 'undo_last_set', 'adjust_rest_timer',
                          'generate_training_plan', 'update_training_plan', 'show_daily_workout', 'create_custom_session', 'discard_workout',
                          'go_to_exercise', 'open_todays_workout', 'start_todays_workout', 'reschedule_today', 'resolve_interrupted_workout',
                          'show_plan_breakdown', 'show_previous_workout', 'show_top_lifts', 'show_progress_report', 'update_training_days',
                          'update_plan_start_date')
        then 'workout'
      when b->>'name' in ('record_injury', 'show_readiness')
        then 'recovery'
      when b->>'name' in ('log_checkin', 'update_profile', 'estimate_body_fat_goal')
        then 'profile'
    end as tag
    from jsonb_array_elements(case when jsonb_typeof(p_blocks) = 'array' then p_blocks else '[]'::jsonb end) turn,
         jsonb_array_elements(case when jsonb_typeof(turn->'content') = 'array' then turn->'content' else '[]'::jsonb end) b
    where b->>'type' = 'tool_use'
    union all
    select 'profile'
    where p_role = 'user'
      and (p_content like 'Training history:%' or p_content like 'Primary goal:%'
           or p_content like 'Weekly training frequency:%' or p_content like 'Injury notes:%')
  ) t
  where tag is not null
$$;

create or replace function conversation_title_from(p_content text)
returns text
language sql
immutable
as $$
  select case when length(t) > 80 then rtrim(left(t, 79)) || '…' else t end
  from (select regexp_replace(btrim(split_part(coalesce(p_content, ''), E'\n', 1)), '\s+', ' ', 'g') as t) s
$$;

create or replace function conversation_titles_from(p_role text, p_content text, p_hidden boolean)
returns boolean
language sql
immutable
as $$
  select p_role = 'user'
    and conversation_is_visible(p_hidden, p_content)
    and length(btrim(p_content)) >= 12
    and p_content not like '[[SYSTEM_CUE]]%'
    and cardinality(conversation_message_tags(p_role, p_content, null)) = 0
$$;

create or replace function conversation_general_continuing(p_user uuid, p_at timestamptz, p_tz text)
returns uuid
language plpgsql
as $$
declare
  v_today date := conversation_local_time(p_at, p_tz)::date;
  v_id uuid;
begin
  select id into v_id
  from conversation
  where user_id = p_user
    and kind = 'general'
    and active_at > p_at - interval '3 days'
    and (
      conversation_local_time(started_at, p_tz)::date = v_today
      or (p_at - active_at < interval '1 hour' and conversation_local_time(started_at, p_tz)::date >= v_today - 1)
    )
  order by active_at desc
  limit 1;
  return v_id;
end;
$$;

create or replace function conversation_general_for(p_user uuid, p_at timestamptz, p_tz text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := conversation_general_continuing(p_user, p_at, p_tz);
begin
  if v_id is not null then
    return v_id;
  end if;
  insert into conversation (user_id, kind, started_at, active_at)
  values (p_user, 'general', p_at, p_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function conversation_find_workout(p_user uuid, p_started timestamptz, p_log uuid)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  if p_log is not null then
    select id into v_id
    from conversation
    where user_id = p_user and kind = 'workout' and workout_log_id = p_log
    order by started_at desc
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  select id into v_id
  from conversation
  where user_id = p_user and kind = 'workout' and workout_started_at = p_started;
  return v_id;
end;
$$;

create or replace function conversation_workout_for(
  p_user uuid,
  p_started timestamptz,
  p_log uuid,
  p_label text,
  p_at timestamptz,
  p_tz text
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid := conversation_find_workout(p_user, p_started, p_log);
  v_moved_from uuid[];
begin
  if v_id is not null then
    if p_log is not null then
      update conversation set workout_log_id = p_log where id = v_id and workout_log_id is null;
    end if;
    return v_id;
  end if;

  insert into conversation (user_id, kind, title, tags, started_at, active_at, workout_started_at, workout_log_id)
  values (
    p_user,
    'workout',
    conversation_workout_title(p_label, p_started, p_tz),
    array['workout'],
    p_started,
    greatest(p_started, p_at),
    p_started,
    coalesce(
      p_log,
      (
        select l.id from workout_log l
        where l.user_id = p_user and l.at >= p_started and l.at <= p_at + interval '1 minute'
          and not exists (select 1 from conversation c where c.workout_log_id = l.id)
        order by l.at
        limit 1
      )
    )
  )
  on conflict (user_id, workout_started_at) where kind = 'workout' do nothing
  returning id into v_id;

  if v_id is null then
    return conversation_find_workout(p_user, p_started, null);
  end if;

  select array_agg(distinct conversation_id) into v_moved_from
  from message
  where user_id = p_user and at >= p_started and conversation_id is not null and conversation_id <> v_id;

  if v_moved_from is not null then
    update message set conversation_id = v_id
    where user_id = p_user and at >= p_started and conversation_id = any(v_moved_from);

    delete from conversation c
    where c.id = any(v_moved_from)
      and c.started_at >= p_started
      and not exists (select 1 from message m where m.conversation_id = c.id);

    perform conversation_refresh_last_message(v_moved_from || v_id);
  end if;

  return v_id;
end;
$$;

create or replace function conversation_resolve(
  p_user uuid,
  p_at timestamptz,
  p_role text,
  p_content text,
  p_create boolean
)
returns uuid
language plpgsql
as $$
declare
  v_tz text;
  v_state jsonb;
  v_updated timestamptz;
  v_started timestamptz;
  v_log uuid;
  v_label text;
  v_conv uuid;
  v_recent_id uuid;
  v_recent_kind text;
  v_recent_active timestamptz;
begin
  select timezone into v_tz from profile where user_id = p_user;

  if p_role = 'assistant' then
    select conversation_id into v_conv
    from message
    where user_id = p_user
      and role = 'user'
      and conversation_id is not null
      and at <= p_at
      and at >= p_at - interval '2 minutes'
    order by at desc
    limit 1;
    if v_conv is not null then
      return v_conv;
    end if;
  end if;

  if abs(extract(epoch from (now() - p_at))) < 600 then
    select state, updated_at into v_state, v_updated
    from live_session_state
    where user_id = p_user;

    if v_state is not null
      and v_updated > now() - interval '60 minutes'
      and coalesce((v_state->>'ended')::boolean, false) = false
      and nullif(v_state->>'startedAt', '') is not null
    then
      v_started := (v_state->>'startedAt')::timestamptz;
      v_log := case
        when coalesce(v_state->>'workoutLogId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (v_state->>'workoutLogId')::uuid
      end;
      v_label := coalesce(nullif(v_state->>'focus', ''), v_state->'target'->>'activity');
      if p_create then
        return conversation_workout_for(p_user, v_started, v_log, v_label, p_at, v_tz);
      end if;
      return conversation_find_workout(p_user, v_started, v_log);
    end if;
  end if;

  if coalesce(p_content, '') not like '[[SYSTEM_CUE]]%' then
    select id into v_conv
    from conversation
    where user_id = p_user and pinned_at > now() - interval '30 minutes'
    order by pinned_at desc
    limit 1;
    if v_conv is not null then
      return v_conv;
    end if;
  end if;

  select id, kind, active_at into v_recent_id, v_recent_kind, v_recent_active
  from conversation
  where user_id = p_user
  order by active_at desc
  limit 1;

  if v_recent_kind = 'workout' and p_at - v_recent_active < interval '5 minutes' then
    return v_recent_id;
  end if;

  if p_create then
    return conversation_general_for(p_user, p_at, v_tz);
  end if;
  return conversation_general_continuing(p_user, p_at, v_tz);
end;
$$;

create or replace function conversation_assign_message()
returns trigger
language plpgsql
as $$
declare
  v_at timestamptz := coalesce(new.at, now());
  v_visible boolean := conversation_is_visible(new.hidden, new.content);
  v_bumps boolean := v_visible or coalesce(new.content, '') like '[[SYSTEM_CUE]]%';
  v_titles boolean := conversation_titles_from(new.role::text, new.content, new.hidden);
  v_tags text[];
  v_conv uuid;
begin
  if new.conversation_id is not null then
    if not exists (select 1 from conversation where id = new.conversation_id and user_id = new.user_id) then
      raise exception 'conversation % does not belong to user %', new.conversation_id, new.user_id;
    end if;
    v_conv := new.conversation_id;
  else
    begin
      perform pg_advisory_xact_lock(hashtextextended('conversation:' || new.user_id::text, 0));
      v_conv := conversation_resolve(new.user_id, v_at, new.role::text, new.content, true);
    exception when others then
      raise warning 'conversation_assign_message failed for user %: %', new.user_id, sqlerrm;
      v_conv := null;
    end;
    new.conversation_id := v_conv;
  end if;

  if v_conv is null then
    return new;
  end if;

  begin
    v_tags := conversation_message_tags(new.role::text, new.content, new.blocks);
    if v_bumps or v_titles or cardinality(v_tags) > 0 then
      update conversation c
      set active_at = case when v_bumps then greatest(c.active_at, v_at) else c.active_at end,
          last_message_at = case when v_visible then greatest(coalesce(c.last_message_at, v_at), v_at) else c.last_message_at end,
          tags = case when cardinality(v_tags) > 0 then array(select distinct t from unnest(c.tags || v_tags) t order by t) else c.tags end,
          title = case when c.title is null and c.kind = 'general' and v_titles then conversation_title_from(new.content) else c.title end
      where c.id = v_conv;
    end if;
  exception when others then
    raise warning 'conversation_assign_message could not update conversation %: %', v_conv, sqlerrm;
  end;

  return new;
end;
$$;

create or replace function conversation_enter(p_conversation_id uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    return null;
  end if;

  if p_conversation_id is not null then
    select id into v_id from conversation where id = p_conversation_id and user_id = v_user;
    if v_id is null then
      return null;
    end if;
  end if;

  update conversation
  set pinned_at = case when id = v_id then now() end
  where user_id = v_user and (pinned_at is not null or id = v_id);

  if v_id is not null then
    return v_id;
  end if;
  return conversation_resolve(v_user, now(), 'user', '', false);
end;
$$;

create or replace function conversation_leave()
returns void
language sql
as $$
  update conversation set pinned_at = null where user_id = auth.uid() and pinned_at is not null
$$;

update conversation c
set tags = coalesce((
  select array_agg(distinct t order by t)
  from message m, unnest(conversation_message_tags(m.role::text, m.content, m.blocks)) t
  where m.conversation_id = c.id
), '{}');

update conversation
set tags = array(select distinct t from unnest(tags || array['workout']) t order by t)
where kind = 'workout';

update conversation c
set title = (
  select conversation_title_from(m.content)
  from message m
  where m.conversation_id = c.id and conversation_titles_from(m.role::text, m.content, m.hidden)
  order by m.at
  limit 1
)
where c.kind = 'general' and c.title is null;

revoke execute on function conversation_message_tags(text, text, jsonb) from public, anon;
revoke execute on function conversation_title_from(text) from public, anon;
revoke execute on function conversation_titles_from(text, text, boolean) from public, anon;
revoke execute on function conversation_general_continuing(uuid, timestamptz, text) from public, anon;
revoke execute on function conversation_find_workout(uuid, timestamptz, uuid) from public, anon;
revoke execute on function conversation_resolve(uuid, timestamptz, text, text, boolean) from public, anon;
revoke execute on function conversation_enter(uuid) from public, anon;
revoke execute on function conversation_leave() from public, anon;

grant execute on function conversation_message_tags(text, text, jsonb) to authenticated, service_role;
grant execute on function conversation_title_from(text) to authenticated, service_role;
grant execute on function conversation_titles_from(text, text, boolean) to authenticated, service_role;
grant execute on function conversation_general_continuing(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function conversation_find_workout(uuid, timestamptz, uuid) to authenticated, service_role;
grant execute on function conversation_resolve(uuid, timestamptz, text, text, boolean) to authenticated, service_role;
grant execute on function conversation_enter(uuid) to authenticated, service_role;
grant execute on function conversation_leave() to authenticated, service_role;
