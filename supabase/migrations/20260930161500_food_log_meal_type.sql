-- The Fuel screen inferred a meal's label purely from the clock hour, so a meal the user
-- explicitly called breakfast showed as "Dinner" when it was logged in the evening. There was
-- nowhere to put what they actually said: food_log had no meal-type column at all.
alter table food_log
  add column if not exists meal_type text
    check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack'));

comment on column food_log.meal_type is
  'What the user called this meal, when they said so. Null means they did not, and the reader falls back to inferring it from `at`.';
