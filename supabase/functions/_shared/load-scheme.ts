export type Units = 'metric' | 'imperial';

const KG_RANGE = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|kilogrammes?|kilograms?)\b/gi;
const KG_SINGLE = /(\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|kilogrammes?|kilograms?)\b/gi;
const LB_RANGE = /(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/gi;
const LB_SINGLE = /(\d+(?:\.\d+)?)\s*(?:lbs?|pounds?)\b/gi;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const toLb = (kg: number): number => round1(kg * 2.20462);
const toKg = (lb: number): number => round1(lb * 0.453592);

export const convertLoadScheme = (scheme: string, units: Units): string =>
  units === 'imperial'
    ? scheme
        .replace(KG_RANGE, (_m, a, b) => `${toLb(Number(a))}-${toLb(Number(b))} lb`)
        .replace(KG_SINGLE, (_m, n) => `${toLb(Number(n))} lb`)
    : scheme
        .replace(LB_RANGE, (_m, a, b) => `${toKg(Number(a))}-${toKg(Number(b))} kg`)
        .replace(LB_SINGLE, (_m, n) => `${toKg(Number(n))} kg`);

const WEIGHT_KEYS = new Set(['weight_kg', 'target_weight_kg', 'current_weight_kg']);

const localizeLoadCsv = (load: string, units: Units): string => {
  const parts = load.split(',').map((v) => v.trim());
  const numbers = parts.map((v) => Number(v));
  if (numbers.some((n) => !Number.isFinite(n))) return load;
  return units === 'imperial'
    ? `${numbers.map(toLb).join(', ')} lb`
    : `${numbers.map(round1).join(', ')} kg`;
};

export const localizeWeights = (value: unknown, units: Units): unknown => {
  if (Array.isArray(value)) return value.map((v) => localizeWeights(v, units));
  if (value === null || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'load_scheme' && typeof raw === 'string') {
      out[key] = convertLoadScheme(raw, units);
    } else if (key === 'load' && typeof raw === 'string' && raw !== 'bodyweight') {
      out[key] = localizeLoadCsv(raw, units);
    } else if (WEIGHT_KEYS.has(key) && typeof raw === 'number') {
      if (units === 'imperial') out[key.replace(/_kg$/, '_lb')] = toLb(raw);
      else out[key] = round1(raw);
    } else {
      out[key] = localizeWeights(raw, units);
    }
  }
  return out;
};

const BODYWEIGHT = /^(?:bodyweight|body ?weight|bw|none|n\/a|-)$/i;

export const normalizeLoadToKg = (load: unknown): string => {
  if (typeof load === 'number') return Number.isFinite(load) ? String(round1(load)) : 'bodyweight';
  if (typeof load !== 'string') return 'bodyweight';

  const trimmed = load.trim();
  if (!trimmed || BODYWEIGHT.test(trimmed)) return 'bodyweight';

  const isPounds = /\b(?:lbs?|pounds?)\b/i.test(trimmed);
  const numbers = trimmed
    .split(',')
    .map((part) => parseFloat(part.replace(/[^\d.]/g, '')))
    .filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return 'bodyweight';

  return numbers.map((n) => (isPounds ? toKg(n) : round1(n))).join(',');
};

export const normalizeExercisesDone = (list: unknown): unknown =>
  Array.isArray(list)
    ? list.map((entry) =>
        entry && typeof entry === 'object' && 'load' in (entry as Record<string, unknown>)
          ? { ...(entry as Record<string, unknown>), load: normalizeLoadToKg((entry as Record<string, unknown>).load) }
          : entry,
      )
    : list;
