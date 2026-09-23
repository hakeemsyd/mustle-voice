update plan_session ps
set weekday = null
from training_plan tp
where tp.id = ps.plan_id
  and tp.status = 'active'
  and ps.weekday is not null;
