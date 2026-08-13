alter table message
  add column hidden boolean not null default false;

comment on column message.hidden is
  'True for scaffolding exchanges the app fires on its own (e.g. the once-a-day Home greeting) '
  'rather than something the user actually said — excluded from the visible chat transcript, '
  'but the assistant reply still surfaces elsewhere (e.g. as Home''s headline message).';
