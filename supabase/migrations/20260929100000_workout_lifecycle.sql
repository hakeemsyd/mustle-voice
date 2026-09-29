-- Unfinished-workout lifecycle (Damion, 2026-09-29). A workout the user left or lost connection
-- on stays open and can be continued for 24 hours after its last activity. After that it closes
-- as partial with its real sets kept, and the coach asks once how the rest of it went. Ending
-- early closes it straight away. 'interrupted' is retired: those rows become closed partials.

alter table workout_log
  add column last_activity_at     timestamptz not null default now(),
  add column ended_at             timestamptz,
  add column ended_by             text check (ended_by in ('user', 'timeout', 'coach')),
  add column followup_asked_at    timestamptz,
  add column followup_resolved_at timestamptz;

update workout_log set last_activity_at = at;

update workout_log
set ended_at = at,
    ended_by = 'user'
where status = 'completed';

update workout_log
set status = 'partial',
    ended_at = at,
    ended_by = case when note is not null then 'user' else 'timeout' end
where status in ('partial', 'interrupted')
  and at < now() - interval '24 hours';

update workout_log set status = 'partial' where status = 'interrupted';

update workout_log
set followup_resolved_at = now()
where ended_by = 'timeout'
  and at < now() - interval '3 days';

create or replace function workout_log_touch_activity()
returns trigger
language plpgsql
as $$
begin
  if new.exercises_done is distinct from old.exercises_done
     and new.last_activity_at is not distinct from old.last_activity_at then
    new.last_activity_at := now();
  end if;
  return new;
end;
$$;

create trigger workout_log_touch_activity
  before update on workout_log
  for each row execute function workout_log_touch_activity();

create index workout_log_open_idx on workout_log (user_id, last_activity_at desc)
  where status in ('partial', 'interrupted') and ended_at is null;

comment on column workout_log.last_activity_at is
  'When a set was last written to this workout. An unfinished workout can be continued for 24 hours after this.';
comment on column workout_log.ended_at is
  'When the workout was closed: finished, ended early, closed after 24 hours without activity, or settled with the coach. Null while it is still open to continue.';
comment on column workout_log.ended_by is
  'user: finished or ended it in the app (or moved on to another workout). timeout: closed after 24 hours without activity. coach: settled in conversation.';
comment on column workout_log.followup_asked_at is
  'When the coach asked how the rest of a timed-out workout went. Asked once, never repeated.';
comment on column workout_log.followup_resolved_at is
  'When that follow-up was settled (finished elsewhere, stopped early, or discarded).';
