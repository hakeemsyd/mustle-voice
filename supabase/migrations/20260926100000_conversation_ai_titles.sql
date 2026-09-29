alter table conversation
  add column title_source text not null default 'auto' check (title_source in ('auto', 'ai')),
  add column titled_message_count int not null default 0,
  add column title_requested_at timestamptz;

comment on column conversation.title_source is
  'auto: the placeholder from the first real user message (set by the message trigger). ai: written by the conversation-titles function, which also re-titles once at 8 and once at 24 visible messages.';

create or replace function conversation_claim_titles(p_limit int default 8)
returns table (conversation_id uuid, visible_count int)
language plpgsql
as $$
begin
  return query
  with candidates as (
    select
      c.id as cid,
      c.title_source as source,
      c.titled_message_count as titled,
      c.last_message_at as last_at,
      (
        select count(*)::int from message m
        where m.conversation_id = c.id and conversation_is_visible(m.hidden, m.content)
      ) as n
    from conversation c
    where c.user_id = auth.uid()
      and c.kind = 'general'
      and c.last_message_at is not null
      and (c.title_requested_at is null or c.title_requested_at < now() - interval '2 minutes')
    order by c.last_message_at desc
    limit 60
  ),
  due as (
    select cd.cid, cd.n
    from candidates cd
    where (cd.source <> 'ai' and cd.n >= 2)
       or (cd.source = 'ai' and cd.titled < 8 and cd.n >= 8)
       or (cd.source = 'ai' and cd.titled < 24 and cd.n >= 24)
    order by cd.last_at desc
    limit greatest(1, least(p_limit, 10))
  )
  update conversation c
  set title_requested_at = now()
  from due
  where c.id = due.cid
  returning c.id, due.n;
end;
$$;

create or replace function conversation_apply_title(p_id uuid, p_title text, p_tags text[], p_count int)
returns void
language sql
as $$
  update conversation c
  set title = left(btrim(p_title), 80),
      title_source = 'ai',
      titled_message_count = greatest(c.titled_message_count, p_count),
      tags = array(
        select distinct t
        from unnest(c.tags || coalesce(p_tags, '{}')) t
        where t in ('meal', 'workout', 'recovery', 'profile')
        order by t
      )
  where c.id = p_id and c.user_id = auth.uid() and length(btrim(coalesce(p_title, ''))) > 0
$$;

revoke execute on function conversation_claim_titles(int) from public, anon;
revoke execute on function conversation_apply_title(uuid, text, text[], int) from public, anon;
grant execute on function conversation_claim_titles(int) to authenticated, service_role;
grant execute on function conversation_apply_title(uuid, text, text[], int) to authenticated, service_role;
