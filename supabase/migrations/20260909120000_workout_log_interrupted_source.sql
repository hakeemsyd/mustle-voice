-- Abandoned-session reconciliation (Damion, 2026-09-09): a workout left running with no
-- activity for a while needs to close on its own rather than sit "active" for hours, and once
-- the user is asked what actually happened, the record needs to say whether it was tracked live
-- or completed independently and reported afterward.
--
-- 'interrupted' is a transient state — the coach asks about it on the next conversation and
-- resolves it to 'completed' or 'partial' (or discards it entirely); it is not meant to be a
-- permanent status shown in the UI.
alter table workout_log
  drop constraint workout_log_status_check;
alter table workout_log
  add constraint workout_log_status_check check (status in ('completed', 'partial', 'interrupted'));

alter table workout_log
  add column source text not null default 'mustle'
    check (source in ('mustle', 'independent'));

comment on column workout_log.source is
  'mustle: tracked live during an in-app session (even if later reconciled after an interruption '
  'with no independently-reported additions). independent: the user told the coach about it '
  '(a fresh manual report, or additions reported after an interrupted session).';
