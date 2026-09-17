import { supabase } from "./supabase";
import { localDateKey } from "./resolveTodaySession";

/** Marks today as an explicit, user-chosen rest day — resolveTodaySession (both here and the
 *  server copy in brain-context.ts) treats this as always winning over the plan's own schedule,
 *  and a chosen rest day holds the streak rather than breaking it. Idempotent: choosing it twice
 *  for the same day just upserts the same row. */
export async function chooseRestDay(userId: string, deferredPlanSessionId: string | null): Promise<void> {
  const date = localDateKey(new Date());

  // A one-off custom session outranks a rest day (that's the point of it), so choosing rest while
  // one is pinned to today has to clear it — otherwise the day stays "due" and Home keeps offering
  // the workout the user just declined.
  const { error: overrideError } = await supabase
    .from("day_override")
    .delete()
    .eq("user_id", userId)
    .eq("date", date);
  if (overrideError) throw new Error(`day_override delete: ${overrideError.message}`);

  const { error } = await supabase
    .from("rest_day")
    .upsert(
      { user_id: userId, date, plan_session_id: deferredPlanSessionId, reason: "switch_workout" },
      { onConflict: "user_id,date" },
    );
  if (error) throw new Error(`rest_day upsert: ${error.message}`);
}
