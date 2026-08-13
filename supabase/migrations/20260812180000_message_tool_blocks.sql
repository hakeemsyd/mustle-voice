alter table message
  add column blocks jsonb;

comment on column message.blocks is
  'Full Anthropic content-block transcript for the turn this assistant row completed: every tool_use turn and its tool_result reply, in order. Null for plain text turns and for user rows. Replayed into the model on later turns so it can see which tools it already executed.';
