type Units = 'metric' | 'imperial';

// Accepts "5'11", "5'11\"", "5 11", "180" (cm). Returns null if unparseable.
export function heightToCm(height: string, units: Units): number | null {
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
}

// Accepts "176", "80" (kg if metric, lbs if imperial). Returns null if unparseable.
export function weightToKg(weight: string, units: Units): number | null {
  const value = parseFloat(weight.trim());
  if (!Number.isFinite(value)) return null;
  return units === 'imperial' ? Math.round(value * 0.453592 * 10) / 10 : value;
}
