import { normalizeArea } from "../../supabase/functions/_shared/injury-validator";

export type BodyView = "front" | "back";

interface ZoneMapping {
  base: string;
  view: BodyView;
  lateral: boolean;
}

const ZONE_MAP: Record<string, ZoneMapping> = {
  neck: { base: "neck", view: "front", lateral: false },
  shoulder: { base: "shoulder", view: "front", lateral: true },
  elbow: { base: "elbow", view: "front", lateral: true },
  wrist: { base: "wrist", view: "front", lateral: true },
  knee: { base: "knee", view: "front", lateral: true },
  ankle: { base: "ankle", view: "front", lateral: true },
  hip: { base: "hips", view: "front", lateral: false },
  lumbar: { base: "lower-back", view: "back", lateral: false },
  chest: { base: "chest", view: "front", lateral: false },
  core: { base: "core", view: "front", lateral: false },
  ab: { base: "core", view: "front", lateral: false },
  bicep: { base: "bicep", view: "front", lateral: true },
  tricep: { base: "tricep", view: "back", lateral: true },
  quad: { base: "quad", view: "front", lateral: true },
  thigh: { base: "quad", view: "front", lateral: true },
  hamstring: { base: "hamstring", view: "back", lateral: true },
  calf: { base: "calf", view: "back", lateral: true },
  glute: { base: "glutes", view: "back", lateral: false },
  back: { base: "upper-back", view: "back", lateral: false },
};

export interface ResolvedInjuryZone {
  zoneId: string;
  view: BodyView;
}

export function resolveInjuryZone(rawArea: string): ResolvedInjuryZone | null {
  const cleaned = rawArea.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
  const hasLeft = cleaned.startsWith("left");
  const hasRight = cleaned.startsWith("right");

  const normalized = normalizeArea(rawArea);
  const mapping = ZONE_MAP[normalized];
  if (!mapping) return null;

  if (!mapping.lateral) return { zoneId: mapping.base, view: mapping.view };
  const side = hasLeft ? "left" : "right";
  return { zoneId: `${mapping.base}-${side}`, view: mapping.view };
}
