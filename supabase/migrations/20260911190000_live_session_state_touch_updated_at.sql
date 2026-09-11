-- `updated_at` defaulted to now() on INSERT but nothing ever refreshed it on UPDATE, and the app
-- upserts only (user_id, state). So a user's row froze its timestamp at whenever it was first
-- created: state kept updating, updated_at never did. brain-voice decides whether a session is
-- live by comparing updated_at against LIVE_STATE_MAX_AGE_MS (1h), so from an hour after a user's
-- very first workout onward, every later session read as stale and the coach was handed no live
-- session state at all -- greeting with "I don't have a live session state block" mid-workout and
-- otherwise talking about the session without being able to see it.
create or replace function touch_live_session_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists live_session_state_touch_updated_at on live_session_state;

create trigger live_session_state_touch_updated_at
  before update on live_session_state
  for each row
  execute function touch_live_session_state_updated_at();
