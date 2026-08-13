alter table workout_log
  add column status text not null default 'completed'
    check (status in ('completed', 'partial'));
