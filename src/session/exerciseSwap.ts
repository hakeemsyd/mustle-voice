import { supabase } from "../lib/supabase";
import { forbiddenTags, type Injury } from "../../supabase/functions/_shared/injury-validator";

export interface SwapCandidate {
  id: string;
  name: string;
}

export async function getSwapCandidates(
  userId: string,
  currentExerciseId: string,
  limit: number = 4,
): Promise<SwapCandidate[]> {
  const [{ data: current }, { data: injuries }] = await Promise.all([
    supabase.from("exercise").select("movement_pattern").eq("id", currentExerciseId).maybeSingle(),
    supabase.from("injury").select("area, status").eq("user_id", userId).eq("status", "active"),
  ]);

  if (!current?.movement_pattern) return [];

  const { data: candidates, error } = await supabase
    .from("exercise")
    .select("id, name, contraindicated_for")
    .eq("movement_pattern", current.movement_pattern)
    .neq("id", currentExerciseId);
  if (error || !candidates) return [];

  const forbidden = forbiddenTags((injuries ?? []) as Injury[]);
  return candidates
    .filter((c) => !(c.contraindicated_for ?? []).some((tag: string) => forbidden.has(tag)))
    .slice(0, limit)
    .map((c) => ({ id: c.id, name: c.name }));
}
