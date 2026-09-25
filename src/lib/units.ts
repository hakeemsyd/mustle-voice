import { kgToLb } from '../../supabase/functions/_shared/weight-units';

export type Units = 'metric' | 'imperial';

// Accepts "5'11", "5'11\"", "5 11", "180" (cm). Returns null if unparseable.
export const heightToCm = (height: string, units: Units): number | null => {
  const trimmed = height.trim();
  if (!trimmed) return null;

  if (units === 'metric') {
    const cm = parseFloat(trimmed);
    return Number.isFinite(cm) ? cm : null;
  }

  const feetInches = trimmed.match(/(\d+)\s*['\s]\s*(\d+)?/);
  if (feetInches) {
    const feet = parseInt(feetInches[1], 10);
    const inches = feetInches[2] ? parseInt(feetInches[2], 10) : 0;
    return Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
  }

  const inchesOnly = parseFloat(trimmed);
  return Number.isFinite(inchesOnly) ? Math.round(inchesOnly * 2.54 * 10) / 10 : null;
};

// Accepts "176", "80" (kg if metric, lbs if imperial). Returns null if unparseable.
export const weightToKg = (weight: string, units: Units): number | null => {
  const value = parseFloat(weight.trim());
  if (!Number.isFinite(value)) return null;
  return units === 'imperial' ? Math.round(value * 0.453592 * 10) / 10 : value;
};

// Display-only reverse of heightToCm — the stored value is always cm regardless of the user's
// preference, so every screen showing it back needs this rather than the raw number.
export const cmToDisplayHeight = (cm: number, units: Units): string => {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
};

// Display-only reverse of weightToKg — the stored value is always kg. Numeric-only, for an
// editable field where the unit itself is shown separately (placeholder/suffix).
export const kgToDisplayWeightValue = (kg: number, units: Units): number =>
  units === 'metric' ? Math.round(kg * 10) / 10 : kgToLb(kg);

export const kgToDisplayWeight = (kg: number, units: Units): string =>
  `${kgToDisplayWeightValue(kg, units)} ${units === 'metric' ? 'kg' : 'lb'}`;
