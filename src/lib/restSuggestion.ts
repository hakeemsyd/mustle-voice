export const DEFAULT_REST_SEC = 90;

export function formatRestSeconds(restSec: number): string {
  return restSec >= 60 ? `${Math.round(restSec / 60)} min rest` : `${restSec}s rest`;
}

/** Upper end of a rep scheme like "6-8", "12", "10/side", "AMRAP". Null when there's
 *  no number to read, which is the case for holds and AMRAP work. */
export function targetRepsFrom(repScheme: string): number | null {
  const numbers = repScheme.match(/\d+/g);
  if (!numbers || numbers.length === 0) return null;
  return Math.max(...numbers.map(Number));
}

/**
 * How long to rest after the set just logged.
 *
 * Rest is driven by how the last set actually went rather than a fixed number: missing
 * the target means the working set was near failure and needs longer, clearing it
 * comfortably means recovery is ahead of the plan and the rest can shorten. Clamped so a
 * strange rep scheme can never produce an absurd timer.
 */
/** Baseline rest before any set has actually been logged — same target-reps read as
 *  suggestRestSeconds, but without an achieved-reps signal to adapt against yet. Standard
 *  strength-training convention: lower-rep/heavier work needs more recovery than higher-rep. */
export function estimateRestSeconds(repScheme: string | null): number {
  const target = repScheme ? targetRepsFrom(repScheme) : null;
  if (target === null) return DEFAULT_REST_SEC;
  if (target <= 6) return 150;
  if (target <= 12) return 90;
  return 60;
}

export type RestSuggestionReason = 'on_target' | 'missed_reps' | 'exceeded_reps' | 'fatigue_addon';

export interface RestSuggestion {
  seconds: number;
  /** Why the target came out where it did — surfaced in the UI so an auto-adapted rest target
   *  never looks like it silently changed for no reason. */
  reason: RestSuggestionReason;
}

export function suggestRestSeconds(
  reps: number,
  repScheme: string,
  setsDone: number,
  totalSets: number,
): RestSuggestion {
  const target = targetRepsFrom(repScheme);
  if (target === null) return { seconds: DEFAULT_REST_SEC, reason: 'on_target' };

  let rest = DEFAULT_REST_SEC;
  let reason: RestSuggestionReason = 'on_target';
  if (reps < target - 2) {
    rest += 45;
    reason = 'missed_reps';
  } else if (reps < target) {
    rest += 20;
    reason = 'missed_reps';
  } else if (reps > target + 2) {
    rest -= 20;
    reason = 'exceeded_reps';
  }

  // Later sets in a run accumulate fatigue, so the back half gets a little more.
  if (totalSets > 1 && setsDone / totalSets > 0.5) {
    rest += 15;
    if (reason === 'on_target') reason = 'fatigue_addon';
  }

  return { seconds: Math.min(180, Math.max(45, rest)), reason };
}
