-- Structured 0-10 pain scale alongside the existing free-text `severity`, so the coach can gate
-- on a real number ("8/10") instead of only ever having unparseable free text to reason from.
alter table injury add column pain_level numeric;
