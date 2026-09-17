-- One-off data repair: interrupted workouts logged on the wrong day.
--
-- BACKGROUND
-- A workout abandoned without a formal end leaves its live_session_state row behind. The next
-- brain request (which may be days later) finalizes it into a workout_log with status
-- 'interrupted' — and until the fix in _shared/interrupted-session.ts, that insert set no `at`,
-- so the row defaulted to now(): the time the CLEANUP ran, not the time the user trained.
-- Confirmed live: a Friday-evening session surfaced as "Last time (Today)" the following Monday,
-- and Calendar marked that Monday as a completed training day.
--
-- The date is not cosmetic. Calendar buckets by `at`, the streak counts off it, and a flexible
-- rotation advances from the last logged session — so one misdated row shifts the whole schedule.
--
-- WHAT IS AND ISN'T RECOVERABLE
-- The true start time lived in live_session_state.state->>'startedAt', and that row is deleted by
-- the same function that writes the workout_log. For rows already finalized, it is GONE — there
-- is no field to copy from, and any repair is an inference. This script therefore does not
-- "fix" anything automatically. It gathers the evidence, you decide, then you apply Step 3.
--
-- The evidence is the conversation trail. Coach turns are persisted to `message` by both brain
-- and brain-voice, so a real session leaves a dense cluster of messages while it is happening.
-- Finalization only happens once live_session_state is older than LIVE_STATE_MAX_AGE_MS (1 hour),
-- so there is always at least an hour of silence between the session's last message and the
-- cleanup. The last message before that one-hour gap is a good proxy for when training stopped.
--
-- USAGE
--   psql "$DATABASE_URL" -f repair-misdated-interrupted-sessions.sql   -- read-only, Steps 1-2
-- Then edit and run Step 3 by hand for each row you have actually decided about.
-- Set :user_id first, or drop the filter to sweep every account.

\set ON_ERROR_STOP on
-- \set user_id '00000000-0000-0000-0000-000000000000'


-- ---------------------------------------------------------------------------
-- STEP 1 — Which interrupted rows look misdated, and when did they really happen?
-- ---------------------------------------------------------------------------
-- `evidence_at`  : last conversation activity before the 1h staleness gap = roughly when they
--                  stopped training.
-- `implied_start`: evidence_at minus the session's own recorded duration.
-- `days_off`     : whole days between the implied training day and the recorded one. 0 means the
--                  row is already on the right day and needs nothing.
-- Every date comparison below runs in the USER's timezone, never psql's. The app buckets a
-- workout into a local calendar day, and these sessions are overwhelmingly evening ones — so a
-- server session running in a different zone flips exactly the rows this script exists to judge.
-- Caught while testing: a correctly-dated row was reported as misdated by a day purely because
-- psql was +05. Falls back to UTC when the profile has no timezone.
with interrupted as (
  select
    w.id,
    w.user_id,
    w.at,
    coalesce(p.timezone, 'UTC')                            as tz,
    coalesce(w.duration_sec, 0)                            as duration_sec,
    w.plan_session_id,
    (select coalesce(sum((e->>'sets')::int), 0)
       from jsonb_array_elements(w.exercises_done) e)      as sets_logged,
    (select string_agg(e->>'name', ', ' order by ord)
       from jsonb_array_elements(w.exercises_done) with ordinality t(e, ord)) as exercises
  from workout_log w
  left join profile p on p.user_id = w.user_id
  where w.status = 'interrupted'
    -- and w.user_id = :'user_id'
),
evidence as (
  select
    i.*,
    (select max(m.at)
       from message m
      where m.user_id = i.user_id
        -- Strictly before the staleness window, so the finalizing turn's own messages — which
        -- land at almost exactly `at` — can't be mistaken for session activity.
        and m.at < i.at - interval '1 hour') as evidence_at
  from interrupted i
)
select
  id,
  tz,
  at                                                as recorded_at,
  (at at time zone tz)::date                        as recorded_local_day,
  evidence_at                                       as last_activity_before_gap,
  (evidence_at at time zone tz)::date               as implied_local_day,
  evidence_at - make_interval(secs => duration_sec) as implied_start,
  ((at at time zone tz)::date - (evidence_at at time zone tz)::date) as days_off,
  duration_sec,
  sets_logged,
  exercises,
  case
    when evidence_at is null then 'NO EVIDENCE — decide by hand'
    when (at at time zone tz)::date = (evidence_at at time zone tz)::date
      then 'looks correct — leave alone'
    else 'MISDATED by ' ||
         ((at at time zone tz)::date - (evidence_at at time zone tz)::date) || ' day(s)'
  end                                               as verdict
from evidence
order by at desc;


-- ---------------------------------------------------------------------------
-- STEP 2 — Is it misdated, or is it a duplicate of a session already logged?
-- ---------------------------------------------------------------------------
-- These need different fixes and the difference is not visible in Step 1. If the same session was
-- also logged properly at the time, the interrupted row is a leftover and should be DELETED —
-- re-dating it would leave two rows for one workout, inflating volume and the streak.
--
-- Matches on same plan_session within a week, and reports whether the logged work overlaps.
select
  w.id                                as interrupted_id,
  w.at                                as interrupted_at,
  o.id                                as other_id,
  o.at                                as other_at,
  o.status                            as other_status,
  (select coalesce(sum((e->>'sets')::int), 0) from jsonb_array_elements(w.exercises_done) e) as interrupted_sets,
  (select coalesce(sum((e->>'sets')::int), 0) from jsonb_array_elements(o.exercises_done) e) as other_sets,
  case
    when w.exercises_done = o.exercises_done then 'IDENTICAL CONTENT — almost certainly a duplicate, delete the interrupted row'
    else 'same plan session nearby — compare before deciding'
  end                                 as note
from workout_log w
join workout_log o
  on  o.user_id = w.user_id
  and o.id <> w.id
  and o.plan_session_id is not distinct from w.plan_session_id
  and o.at between w.at - interval '7 days' and w.at + interval '7 days'
where w.status = 'interrupted'
  -- and w.user_id = :'user_id'
order by w.at desc;


-- ---------------------------------------------------------------------------
-- STEP 3 — Apply, one row at a time, only after reading Steps 1 and 2.
-- ---------------------------------------------------------------------------
-- Deliberately wrapped in a transaction that ROLLS BACK. Run it, read the before/after, and only
-- then change `rollback` to `commit`. There is no undo on the other side of this.

begin;

-- 3a. RE-DATE a genuinely misdated row. Use `implied_start` from Step 1, or a timestamp the user
--     can actually confirm — their memory of the evening beats the inference.
--
-- update workout_log
--    set at = timestamptz '2026-09-12 20:30:00+00'
--  where id = '<interrupted_id>'
--    and status = 'interrupted';          -- guard: never re-date a completed session

-- 3b. DELETE a leftover that duplicates a session already logged (Step 2 said IDENTICAL CONTENT).
--
-- delete from workout_log
--  where id = '<interrupted_id>'
--    and status = 'interrupted';          -- guard: never delete a completed session

-- Verify before committing: both days should now read the way the user remembers them.
select id, at, status,
       (select coalesce(sum((e->>'sets')::int), 0) from jsonb_array_elements(exercises_done) e) as sets
  from workout_log
 -- where user_id = :'user_id'
 order by at desc
 limit 20;

rollback;   -- <<< change to `commit` once the output above is right


-- ---------------------------------------------------------------------------
-- STEP 4 — Nothing to do; noted for completeness.
-- ---------------------------------------------------------------------------
-- New interruptions are stamped from state->>'startedAt' (falling back to
-- live_session_state.updated_at), so this script is for the existing backlog only. Any row
-- finalized after that fix ships is dated from the session itself and needs no repair.
