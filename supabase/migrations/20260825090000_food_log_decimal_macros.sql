-- Food labels regularly carry half-gram values (e.g. 2.5g fat) — integer macro columns forced
-- the coach to invent bad rounding ("2.5 becomes 4g, no wait 2g"). numeric allows real precision.
alter table food_log
  alter column calories type numeric using calories::numeric,
  alter column protein_g type numeric using protein_g::numeric,
  alter column carbs_g type numeric using carbs_g::numeric,
  alter column fat_g type numeric using fat_g::numeric;

-- Corrections update the existing row (update_food) rather than inserting a new one — this is
-- what lets the coach and the UI both show when a meal was last edited.
alter table food_log add column updated_at timestamptz not null default now();
