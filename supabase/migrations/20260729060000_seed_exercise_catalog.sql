-- Seeds `exercise` from supabase/functions/_shared/exercise-catalog.ts. The brain's
-- generate_training_plan/update_training_plan handlers resolve plan exercises by name against
-- this table and reject any name not found here — without this seed every plan proposal fails.
insert into exercise (name, movement_pattern, primary_muscles, contraindicated_for) values
  ('Back Squat', 'squat', '{quads,glutes}', '{deep_knee_flexion_loaded,heavy_axial_load}'),
  ('Front Squat', 'squat', '{quads}', '{deep_knee_flexion_loaded,heavy_axial_load}'),
  ('Leg Press', 'squat', '{quads,glutes}', '{deep_knee_flexion_loaded}'),
  ('Leg Extension', 'squat', '{quads}', '{deep_knee_flexion_loaded}'),
  ('Box Jump', 'plyo', '{quads,glutes}', '{high_impact,deep_knee_flexion_loaded}'),
  ('Deadlift', 'hinge', '{glutes,hamstrings,back}', '{heavy_axial_load,loaded_spinal_flexion}'),
  ('Romanian Deadlift', 'hinge', '{hamstrings,glutes}', '{loaded_spinal_flexion,heavy_axial_load}'),
  ('Hip Thrust', 'hinge', '{glutes}', '{}'),
  ('Leg Curl', 'isolation', '{hamstrings}', '{}'),
  ('Glute Bridge', 'hinge', '{glutes}', '{}'),
  ('Overhead Press', 'push', '{shoulders}', '{overhead_press}'),
  ('Bench Press', 'push', '{chest}', '{heavy_horizontal_press}'),
  ('Incline Dumbbell Press', 'push', '{chest}', '{heavy_horizontal_press}'),
  ('Push-up', 'push', '{chest}', '{}'),
  ('Lat Pulldown', 'pull', '{lats}', '{}'),
  ('Seated Row', 'pull', '{back}', '{}'),
  ('Face Pull', 'pull', '{rear_delts}', '{}'),
  ('Plank', 'core', '{core}', '{}'),
  ('Dead Bug', 'core', '{core}', '{}')
on conflict (name) do nothing;
