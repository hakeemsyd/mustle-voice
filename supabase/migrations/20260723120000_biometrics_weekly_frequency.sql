-- Onboarding captures weekly training frequency as a real parsed number (not free text).
-- generate_training_plan(goal, frequency, history, biometrics, injuries) needs it as a
-- structured input, so it gets a column rather than living only in conversation history.
alter table biometrics add column weekly_frequency int;
