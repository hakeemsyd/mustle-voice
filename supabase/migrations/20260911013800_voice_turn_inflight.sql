-- Tracks which user currently has a brain-voice turn being generated. ElevenLabs retries a slow
-- Custom LLM request every few seconds without cancelling the previous attempt, and each retry
-- lands on a fresh edge function isolate that independently calls Anthropic — confirmed live: up
-- to 8 concurrent calls for a single greeting, all competing for the same rate-limit budget and
-- getting slower together. brain-voice claims a row here before calling Anthropic and deletes it
-- when done; a retry that arrives while a row already exists waits for that turn's result instead
-- of starting a competing call.
create table if not exists voice_turn_inflight (
  user_id uuid primary key,
  started_at timestamptz not null default now()
);
