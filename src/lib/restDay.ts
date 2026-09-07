import { supabase } from "./supabase";
import { localDateKey } from "./resolveTodaySession";

/** Marks today as an explicit, user-chosen rest day — resolveTodaySession (both here and the
 *  server copy in brain-context.ts) treats this as always winning over the plan's own schedule,
 *  and a chosen rest day holds the streak rather than breaking it. Idempotent: choosing it twice
 *  for the same day just upserts the same row. */
export async function chooseRestDay(userId: string, deferredPlanSessionId: string | null): Promise<void> {
  const date = localDateKey(new Date());
  const { error } = await supabase
    .from("rest_day")
    .upsert(
      { user_id: userId, date, plan_session_id: deferredPlanSessionId, reason: "switch_workout" },
      { onConflict: "user_id,date" },
    );
  if (error) throw new Error(`rest_day upsert: ${error.message}`);
}
