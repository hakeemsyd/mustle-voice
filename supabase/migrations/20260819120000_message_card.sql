alter table message
  add column card jsonb;

comment on column message.card is
  'Structured UI card (e.g. plan_breakdown) attached to this assistant reply, if any. Persisted so the card still renders after the chat history reloads, not just on the live response.';
