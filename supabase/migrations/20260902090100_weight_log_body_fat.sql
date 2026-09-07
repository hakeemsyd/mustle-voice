-- Optional body-fat percentage captured alongside a weight measurement (e.g. from a smart scale
-- or a caliper reading the user reports) — nullable, most weight_log rows will never have one.
alter table weight_log add column body_fat_pct numeric;
