import type { SessionExercise } from "../session/ActiveSessionContext";

/** Reads the heaviest load off a logged exercise's comma-joined load string ("60,60,60,60").
 *  Returns null for bodyweight work, or anything that doesn't parse as numbers. */
const topLoad = (load: string | null | undefined): number | null => {
  if (!load || load === "bodyweight") return null;
  const values = load
    .split(",")
    .map((part) => parseFloat(part.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return values.length > 0 ? Math.max(...values) : null;
};

/** Reps actually completed, as a readable list ("8, 8, 7"). A logged set can carry a 1 from a
 *  misheard report, but this states what was recorded rather than quietly cleaning it up —
 *  showing a rep count that never happened is the failure mode worth avoiding here. */
const repList = (reps: string | null | undefined): string | null => {
  const parts = (reps ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
};

/**
 * The design's second bubble: one short coaching line about the session they're about to start.
 * Always returns something when there's a session at all — the reference has a bubble here in
 * every state, and an intro followed by a gap reads as the screen having failed to load.
 *
 * Three cases, in order of how useful they are standing in front of the bar:
 *  1. History for the first exercise — the numbers they need for set one.
 *  2. History for some later exercise but not the first (a swapped-in movement, a changed plan).
 *     Naming a movement they have numbers for beats saying nothing; only the first exercise was
 *     checked before, so one unmatched name silently removed the whole bubble.
 *  3. No history for this session at all — say so plainly and set an honest first-time target
 *     from the plan. Never invent a weight; "find your working weight" is the truthful answer.
 */
export function buildSecondBeat(
  first: SessionExercise | undefined,
  done: { name: string; reps: string; load: string }[],
): string | null {
  if (!first) return null;

  const historyFor = (name: string) => {
    const match = done.find((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (!match) return null;
    const reps = repList(match.reps);
    return reps ? { reps, load: topLoad(match.load) } : null;
  };

  const firstHistory = historyFor(first.name);
  if (firstHistory) {
    return firstHistory.load != null
      ? `Last session on **${first.name}** you worked at ${firstHistory.load}kg for ${firstHistory.reps}. ` +
          `Hold that weight today and chase one more clean rep per set.`
      : `Last session on **${first.name}** you got ${firstHistory.reps}. Chase one more clean rep per set today.`;
  }

  for (const entry of done) {
    const reps = repList(entry.reps);
    if (!reps) continue;
    const load = topLoad(entry.load);
    return load != null
      ? `**${first.name}** is new for you here — start conservative. Last time on **${entry.name}** ` +
          `you worked at ${load}kg for ${reps}, so you've got a reference point later in the session.`
      : `**${first.name}** is new for you here — start conservative. Last time on **${entry.name}** ` +
          `you got ${reps}.`;
  }

  // Deliberately no load_scheme here. It's a raw programming string ("%1RM", "RPE 8") that reads
  // as jargon in a coach's sentence, and the intro bubble above already states sets × reps. Nor
  // does this say "weight": the first movement may well be bodyweight, and there's no way to tell
  // from the plan alone. Nothing is invented — the honest answer to no history is to say so.
  return (
    `First time logging **${first.name}** — no numbers on record yet. Take the first set easy, ` +
    `find something you can control for all ${first.sets}, and you'll have a real baseline to ` +
    `build on next time.`
  );
}
