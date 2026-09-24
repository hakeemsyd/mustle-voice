const ONE_REP_MAX = /\b1\s*-?\s*RM\b|\bone[\s-]*rep[\s-]*max\b|\b1\s*rep\s*max\b/i;

export const WORKING_WEIGHT_LABEL = 'working weight';

export function referencesOneRepMax(scheme: string | null | undefined): boolean {
  return !!scheme && ONE_REP_MAX.test(scheme);
}

export function normalizeLoadScheme<T extends string | null | undefined>(scheme: T): T | string {
  if (typeof scheme !== 'string') return scheme;
  const trimmed = scheme.trim();
  if (!trimmed || !ONE_REP_MAX.test(trimmed)) return scheme;
  const percents = (trimmed.replace(ONE_REP_MAX, ' ').match(/\d+(?:\.\d+)?/g) ?? [])
    .map(Number)
    .filter((n) => n > 0 && n <= 100);
  if (percents.length === 0) return WORKING_WEIGHT_LABEL;
  const top = Math.max(...percents);
  if (top >= 85) return 'heavy';
  if (top >= 70) return 'moderate';
  return 'light';
}
