// Structural validation for a proposed training split — the shape of the week, not the safety of
// its exercises (that's injury-validator.ts).
//
// Nothing checked this before, and it showed: a generated 5-day plan came back as
// Lower → Upper Pull → Lower → Upper Push → Upper Push, which trains the same movement pattern on
// two consecutive days and gives push twice the volume of pull. The exercises in it were each
// individually fine, so every existing gate passed it. Prompt instructions alone have repeatedly
// failed to hold this kind of invariant, so it is enforced in code and returned to the model as a
// revise-and-retry result.

export interface SplitSessionInput {
  day_order: number;
  focus: string;
  /** Present on a pinned plan (0=Sun..6=Sat). When every session has one, adjacency is judged by
   *  the calendar rather than by day_order — Mon/Wed/Fri are positions 1,2,3 in the rotation but
   *  are not consecutive days, and treating them as such rejected an ordinary M/W/F split. */
  weekday?: number | null;
}

export interface SplitProblem {
  kind: 'adjacent_duplicate' | 'imbalanced';
  detail: string;
}

/** "upper_push", "Upper Push", "upper-push" all collapse to the same key. */
const normalizeFocus = (focus: string): string =>
  focus.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');

/** The broad pattern a focus trains, for the balance check. Anything unrecognised is returned as
 *  itself, so a novel focus name is compared only against its own kind rather than being forced
 *  into a bucket it may not belong in. */
const patternOf = (focus: string): string => {
  const f = normalizeFocus(focus);
  if (f.includes('push') || f.includes('chest') || f.includes('tricep')) return 'push';
  if (f.includes('pull') || f.includes('back') || f.includes('bicep')) return 'pull';
  if (f.includes('leg') || f.includes('lower') || f.includes('quad') || f.includes('glute')) return 'legs';
  return f;
};

/**
 * Returns [] for a sound split, otherwise every problem found so the model can revise once and
 * call again. A non-empty result MUST NOT be written to the DB.
 *
 * Two rules, both deliberately narrow — this rejects plans that are wrong by construction, not
 * plans that merely differ from one school of programming:
 *
 *  1. No two consecutive sessions share a focus. In a rotation the last wraps to the first, since
 *     that pair is consecutive in practice too. Training the same pattern twice in a row without
 *     a rest between is a programming error regardless of style.
 *  2. No movement pattern gets more than double the sessions of another pattern that's present.
 *     Push twice and pull once in the same week is the imbalance that produces shoulder problems;
 *     a pattern that simply isn't in the plan at all is not compared (a dedicated upper-body block
 *     is a legitimate choice, and this must not force legs into one).
 */
const isPinned = (sessions: SplitSessionInput[]): boolean =>
  sessions.every((s) => typeof s.weekday === 'number' && s.weekday >= 0 && s.weekday <= 6);

/** Whether two sessions land on genuinely consecutive calendar days. */
const areAdjacentDays = (a: SplitSessionInput, b: SplitSessionInput, pinned: boolean): boolean => {
  if (!pinned) return true;
  const gap = (((b.weekday as number) - (a.weekday as number)) % 7 + 7) % 7;
  return gap === 1;
};

export function validateSplit(sessions: SplitSessionInput[]): SplitProblem[] {
  const pinned = isPinned(sessions);
  const ordered = sessions
    .slice()
    .sort((a, b) => (pinned ? (a.weekday as number) - (b.weekday as number) : a.day_order - b.day_order));
  if (ordered.length < 2) return [];

  const problems: SplitProblem[] = [];

  // A plan where every session carries the same focus is a full-body program — repeating it is
  // the design, not an accident, and full body three times a week is one of the most common
  // beginner programs there is. The adjacency rule is about a *split* putting two of its parts
  // back to back, so it only applies once there's more than one part.
  const distinctFocuses = new Set(ordered.map((s) => normalizeFocus(s.focus)));
  if (distinctFocuses.size < 2) return problems;

  for (let i = 0; i < ordered.length; i++) {
    // The wrap-around pair is skipped for a 2-session rotation, where first and last are the same
    // adjacency already checked going forward.
    const isWrap = i === ordered.length - 1;
    if (isWrap && ordered.length === 2) break;
    const current = ordered[i];
    const next = ordered[(i + 1) % ordered.length];
    if (normalizeFocus(current.focus) === normalizeFocus(next.focus) && areAdjacentDays(current, next, pinned)) {
      problems.push({
        kind: 'adjacent_duplicate',
        detail:
          `"${current.focus}" is scheduled twice in a row (day ${current.day_order} and day ` +
          `${next.day_order})${isWrap ? ', which wrap around to consecutive days' : ''}. The same ` +
          `focus must never run on back-to-back days — put a different focus or a rest between them.`,
      });
    }
  }

  const counts = new Map<string, number>();
  for (const session of ordered) {
    const pattern = patternOf(session.focus);
    counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  if (counts.size > 1) {
    const entries = [...counts.entries()];
    const most = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    const least = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
    if (most[1] > least[1] * 2) {
      problems.push({
        kind: 'imbalanced',
        detail:
          `${most[0]} gets ${most[1]} session${most[1] === 1 ? '' : 's'} while ${least[0]} gets ` +
          `only ${least[1]} — more than double. Even the volume out across the patterns the plan ` +
          `actually trains.`,
      });
    }
  }

  return problems;
}

export function explainSplitProblems(problems: SplitProblem[]): string {
  return problems.map((p) => p.detail).join(' ');
}
