create table conversation (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  kind               text not null default 'general' check (kind in ('general', 'workout')),
  title              text,
  category           text check (category in ('workout', 'nutrition', 'recovery', 'body', 'plan', 'general')),
  started_at         timestamptz not null default now(),
  active_at          timestamptz not null default now(),
  last_message_at    timestamptz,
  workout_started_at timestamptz,
  workout_log_id     uuid references workout_log on delete set null,
  created_at         timestamptz not null default now()
);

create index conversation_user_active_idx on conversation (user_id, active_at desc);
create index conversation_user_last_message_idx on conversation (user_id, last_message_at desc nulls last);
create unique index conversation_workout_start_idx on conversation (user_id, workout_started_at) where kind = 'workout';
create index conversation_workout_log_idx on conversation (workout_log_id) where workout_log_id is not null;

alter table conversation enable row level security;

create policy own_rows on conversation for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table conversation is
  'A titled chat thread. Every message belongs to one, assigned by the message insert trigger so voice, keyboard, app lines and older builds all land in the same thread. kind=workout: one per workout (keyed by the live state startedAt, linked to its workout_log). kind=general: one per local day, continued across midnight while the user is still talking (under an hour of silence), or started explicitly.';
comment on column conversation.active_at is
  'Routing pointer: the most recent conversation by active_at is the one new messages continue. Bumped by visible messages, by every message during a live workout, and (later) when the user reopens a conversation or starts a new one.';
comment on column conversation.last_message_at is
  'Time of the latest visible, non-empty message. Null for a conversation holding only hidden scaffolding (e.g. the Home greeting), which the conversation list should skip.';

alter table message add column conversation_id uuid references conversation on delete cascade;

create index message_conversation_at_idx on message (conversation_id, at);

create or replace function conversation_local_time(p_at timestamptz, p_tz text)
returns timestamp
language plpgsql
stable
as $$
begin
  return p_at at time zone coalesce(nullif(p_tz, ''), 'UTC');
exception when others then
  return p_at at time zone 'UTC';
end;
$$;

create or replace function conversation_is_visible(p_hidden boolean, p_content text)
returns boolean
language sql
immutable
as $$
  select not coalesce(p_hidden, false) and length(btrim(coalesce(p_content, ''))) > 0
$$;

create or replace function conversation_workout_title(p_label text, p_started timestamptz, p_tz text)
returns text
language sql
stable
as $$
  select coalesce(nullif(initcap(replace(btrim(coalesce(p_label, '')), '_', ' ')), ''), 'Workout')
    || ' · ' || to_char(conversation_local_time(p_started, p_tz), 'Mon FMDD')
$$;

create or replace function conversation_general_for(p_user uuid, p_at timestamptz, p_tz text)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_active timestamptz;
begin
  select id, active_at into v_id, v_active
  from conversation
  where user_id = p_user and kind = 'general'
  order by active_at desc
  limit 1;

  if v_id is not null and (
    p_at - v_active < interval '1 hour'
    or conversation_local_time(p_at, p_tz)::date = conversation_local_time(v_active, p_tz)::date
  ) then
    return v_id;
  end if;

  insert into conversation (user_id, kind, started_at, active_at)
  values (p_user, 'general', p_at, p_at)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function conversation_refresh_last_message(p_ids uuid[])
returns void
language sql
as $$
  update conversation c
  set last_message_at = (
    select max(m.at) from message m
    where m.conversation_id = c.id and conversation_is_visible(m.hidden, m.content)
  )
  where c.id = any(p_ids)
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
  v_id uuid;
  v_moved_from uuid[];
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

  if v_id is not null then
    if p_log is not null then
      update conversation set workout_log_id = p_log where id = v_id and workout_log_id is null;
    end if;
    return v_id;
  end if;

  insert into conversation (user_id, kind, title, category, started_at, active_at, workout_started_at, workout_log_id)
  values (
    p_user,
    'workout',
    conversation_workout_title(p_label, p_started, p_tz),
    'workout',
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
    select id into v_id
    from conversation
    where user_id = p_user and kind = 'workout' and workout_started_at = p_started;
    return v_id;
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

create or replace function conversation_assign_message()
returns trigger
language plpgsql
as $$
declare
  v_at timestamptz := coalesce(new.at, now());
  v_visible boolean := conversation_is_visible(new.hidden, new.content);
  v_tz text;
  v_state jsonb;
  v_updated timestamptz;
  v_log uuid;
  v_conv uuid;
  v_live boolean := false;
  v_recent_id uuid;
  v_recent_kind text;
  v_recent_active timestamptz;
begin
  if new.conversation_id is not null then
    if not exists (select 1 from conversation where id = new.conversation_id and user_id = new.user_id) then
      raise exception 'conversation % does not belong to user %', new.conversation_id, new.user_id;
    end if;
    v_conv := new.conversation_id;
  else
    begin
      perform pg_advisory_xact_lock(hashtextextended('conversation:' || new.user_id::text, 0));
      select timezone into v_tz from profile where user_id = new.user_id;

      if abs(extract(epoch from (now() - v_at))) < 600 then
        select state, updated_at into v_state, v_updated
        from live_session_state
        where user_id = new.user_id;

        if v_state is not null
          and v_updated > now() - interval '60 minutes'
          and coalesce((v_state->>'ended')::boolean, false) = false
          and nullif(v_state->>'startedAt', '') is not null
        then
          v_log := case
            when coalesce(v_state->>'workoutLogId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then (v_state->>'workoutLogId')::uuid
          end;
          v_conv := conversation_workout_for(
            new.user_id,
            (v_state->>'startedAt')::timestamptz,
            v_log,
            coalesce(nullif(v_state->>'focus', ''), v_state->'target'->>'activity'),
            v_at,
            v_tz
          );
          v_live := v_conv is not null;
        end if;
      end if;

      if v_conv is null and new.role = 'assistant' then
        select conversation_id into v_conv
        from message
        where user_id = new.user_id
          and role = 'user'
          and conversation_id is not null
          and at <= v_at
          and at >= v_at - interval '2 minutes'
        order by at desc
        limit 1;
      end if;

      if v_conv is null then
        select id, kind, active_at into v_recent_id, v_recent_kind, v_recent_active
        from conversation
        where user_id = new.user_id
        order by active_at desc
        limit 1;

        if v_recent_kind = 'workout' and v_at - v_recent_active < interval '5 minutes' then
          v_conv := v_recent_id;
        else
          v_conv := conversation_general_for(new.user_id, v_at, v_tz);
        end if;
      end if;
    exception when others then
      raise warning 'conversation_assign_message failed for user %: %', new.user_id, sqlerrm;
      v_conv := null;
    end;
    new.conversation_id := v_conv;
  end if;

  if v_conv is not null and (v_live or v_visible) then
    begin
      update conversation
      set active_at = greatest(active_at, v_at),
          last_message_at = case when v_visible then greatest(coalesce(last_message_at, v_at), v_at) else last_message_at end
      where id = v_conv;
    exception when others then
      raise warning 'conversation_assign_message could not bump conversation %: %', v_conv, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

create trigger message_assign_conversation
  before insert on message
  for each row
  execute function conversation_assign_message();

create or replace function conversation_link_workout_log()
returns trigger
language plpgsql
as $$
begin
  update conversation
  set workout_log_id = new.id
  where id = (
    select c.id from conversation c
    where c.user_id = new.user_id
      and c.kind = 'workout'
      and c.workout_log_id is null
      and c.workout_started_at <= new.at
      and c.active_at >= new.at - interval '60 minutes'
    order by c.workout_started_at desc
    limit 1
  );
  return new;
exception when others then
  raise warning 'conversation_link_workout_log failed for user %: %', new.user_id, sqlerrm;
  return new;
end;
$$;

create trigger workout_log_link_conversation
  after insert on workout_log
  for each row
  execute function conversation_link_workout_log();

do $$
declare
  r record;
  w record;
  v_user uuid;
  v_tz text;
  v_prev timestamptz;
  v_workout uuid;
  v_conv uuid;
  v_visible boolean;
begin
  for r in
    select id, user_id, at, role, content, hidden
    from message
    where conversation_id is null
    order by user_id, at, id
  loop
    if v_user is distinct from r.user_id then
      v_user := r.user_id;
      v_prev := null;
      v_workout := null;
      v_tz := (select timezone from profile where user_id = r.user_id);
    end if;

    if v_workout is not null and r.at - v_prev >= interval '20 minutes' then
      v_workout := null;
    end if;

    if v_workout is null and r.role = 'user' and r.content like '[[SYSTEM_CUE]]%' then
      insert into conversation (user_id, kind, category, started_at, active_at, workout_started_at)
      values (r.user_id, 'workout', 'workout', r.at, r.at, r.at)
      on conflict (user_id, workout_started_at) where kind = 'workout' do nothing
      returning id into v_workout;
      if v_workout is null then
        select id into v_workout
        from conversation
        where user_id = r.user_id and kind = 'workout' and workout_started_at = r.at;
      end if;
    end if;

    v_conv := coalesce(v_workout, conversation_general_for(r.user_id, r.at, v_tz));
    v_visible := conversation_is_visible(r.hidden, r.content);

    update message set conversation_id = v_conv where id = r.id;

    if v_visible or v_conv = v_workout then
      update conversation
      set active_at = greatest(active_at, r.at),
          last_message_at = case when v_visible then greatest(coalesce(last_message_at, r.at), r.at) else last_message_at end
      where id = v_conv;
    end if;

    v_prev := r.at;
  end loop;

  for w in
    select c.id, c.user_id, c.workout_started_at, max(m.at) as last_at
    from conversation c
    join message m on m.conversation_id = c.id
    where c.kind = 'workout' and c.workout_log_id is null
    group by c.id, c.user_id, c.workout_started_at
    order by c.workout_started_at
  loop
    update conversation
    set workout_log_id = (
      select l.id from workout_log l
      where l.user_id = w.user_id
        and l.at >= w.workout_started_at - interval '1 minute'
        and l.at <= w.last_at + interval '5 minutes'
        and not exists (select 1 from conversation c2 where c2.workout_log_id = l.id)
      order by l.at
      limit 1
    )
    where id = w.id;
  end loop;

  update conversation c
  set title = conversation_workout_title(
    (
      select coalesce(ps.focus, l.cardio_activity)
      from workout_log l
      left join plan_session ps on ps.id = l.plan_session_id
      where l.id = c.workout_log_id
    ),
    c.started_at,
    (select p.timezone from profile p where p.user_id = c.user_id)
  )
  where c.kind = 'workout' and c.title is null;
end;
$$;

revoke execute on function conversation_local_time(timestamptz, text) from public, anon;
revoke execute on function conversation_is_visible(boolean, text) from public, anon;
revoke execute on function conversation_workout_title(text, timestamptz, text) from public, anon;
revoke execute on function conversation_general_for(uuid, timestamptz, text) from public, anon;
revoke execute on function conversation_refresh_last_message(uuid[]) from public, anon;
revoke execute on function conversation_workout_for(uuid, timestamptz, uuid, text, timestamptz, text) from public, anon;

grant execute on function conversation_local_time(timestamptz, text) to authenticated, service_role;
grant execute on function conversation_is_visible(boolean, text) to authenticated, service_role;
grant execute on function conversation_workout_title(text, timestamptz, text) to authenticated, service_role;
grant execute on function conversation_general_for(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function conversation_refresh_last_message(uuid[]) to authenticated, service_role;
grant execute on function conversation_workout_for(uuid, timestamptz, uuid, text, timestamptz, text) to authenticated, service_role;
