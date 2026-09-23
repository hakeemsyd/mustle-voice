const LOW_RATIO = 0.4;
const HIGH_RATIO = 2.5;

const KG = /(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|kilogrammes?|kilograms?)\b/i;
const LB = /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/i;

export function parseLoadSchemeKg(scheme: string | null | undefined): number | null {
  if (!scheme) return null;
  const kg = KG.exec(scheme);
  if (kg) return Number(kg[1]);
  const lb = LB.exec(scheme);
  if (lb) return Math.round(Number(lb[1]) * 0.453592 * 10) / 10;
  return null;
}

export function isImplausibleWeightJump(
  next: number | null | undefined,
  reference: number | null | undefined,
): boolean {
  if (next == null || reference == null) return false;
  if (next <= 0 || reference <= 0) return false;
  const ratio = next / reference;
  return ratio < LOW_RATIO || ratio > HIGH_RATIO;
}
