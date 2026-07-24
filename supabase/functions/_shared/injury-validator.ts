// Deterministic injury-safety validator — the hard gate for the coaching brain.
//
// Pure, no I/O: runs in the edge function (Deno) AND unit-tests in Node. This is what makes
// "a flagged knee never gets a heavy-squat day" PROVABLY hold — it's code, not a prompt.
// The brain proposes a plan; this validates it; no plan persists unless validatePlan() === [].

export type InjuryStatus = 'active' | 'resolved';
export interface Injury { area: string; status: InjuryStatus }
export interface PlanExerciseInput { name: string; contraindicatedFor?: string[] }
export interface Violation { exercise: string; injuryArea: string; tag: string }

// An injury area forbids a set of movement tags. Exercises are tagged with the same
// vocabulary (see exercise-catalog.ts); a match is a violation.
const INJURY_FORBIDS: Record<string, string[]> = {
  knee:       ['deep_knee_flexion_loaded', 'high_impact', 'heavy_axial_load'],
  lumbar:     ['heavy_axial_load', 'loaded_spinal_flexion', 'loaded_spinal_extension'],
  shoulder:   ['overhead_press', 'heavy_horizontal_press', 'behind_neck'],
  elbow:      ['heavy_horizontal_press', 'deep_elbow_flexion_loaded'],
  wrist:      ['loaded_wrist_extension'],
  hip:        ['deep_hip_flexion_loaded', 'high_impact'],
  ankle:      ['high_impact', 'deep_ankle_dorsiflexion_loaded'],
};

// 'left_knee', 'Right Knee', 'knees' -> 'knee'; 'lower back' / 'spine' / 'lumbar' -> 'lumbar'.
export function normalizeArea(area: string): string {
  let a = area.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');
  a = a.replace(/^(left|right)_?/, '').replace(/s$/, '');
  if (a.includes('back') || a.includes('spine') || a.includes('lumbar')) return 'lumbar';
  for (const key of Object.keys(INJURY_FORBIDS)) if (a.includes(key)) return key;
  return a;
}

// Union of tags forbidden by all ACTIVE injuries (resolved injuries impose nothing).
export function forbiddenTags(injuries: Injury[]): Set<string> {
  const tags = new Set<string>();
  for (const inj of injuries) {
    if (inj.status !== 'active') continue;
    for (const t of INJURY_FORBIDS[normalizeArea(inj.area)] ?? []) tags.add(t);
  }
  return tags;
}

// THE GATE. Returns [] if safe; otherwise every specific violation, so the LLM can revise.
// A plan with a non-empty result MUST NOT be written to the DB.
export function validatePlan(exercises: PlanExerciseInput[], injuries: Injury[]): Violation[] {
  const forbidden = forbiddenTags(injuries);
  if (forbidden.size === 0) return [];
  const activeAreas = injuries.filter(i => i.status === 'active').map(i => normalizeArea(i.area));
  const violations: Violation[] = [];
  for (const ex of exercises) {
    for (const tag of ex.contraindicatedFor ?? []) {
      if (!forbidden.has(tag)) continue;
      const injuryArea = activeAreas.find(a => (INJURY_FORBIDS[a] ?? []).includes(tag)) ?? 'injury';
      violations.push({ exercise: ex.name, injuryArea, tag });
    }
  }
  return violations;
}

export function isPlanSafe(exercises: PlanExerciseInput[], injuries: Injury[]): boolean {
  return validatePlan(exercises, injuries).length === 0;
}

// Human-readable reasons to feed back to Claude so it revises the plan.
export function explainViolations(violations: Violation[]): string {
  if (violations.length === 0) return 'Plan is safe.';
  return violations
    .map(v => `"${v.exercise}" is contraindicated for a ${v.injuryArea} injury (${v.tag}).`)
    .join(' ');
}
