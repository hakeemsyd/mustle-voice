import { parseSetReport, type ParsedSet, type ParseSetOptions } from '../../supabase/functions/_shared/set-report';
import { kgToDisplayWeight, type Units } from './units';

export {
  looksLikeStartSetCommand,
  needsWeightBeforeLogging,
  parseSetReport,
  parseStatedWeight,
  parseWeightReply,
  type ParsedSet,
  type ParseSetOptions,
} from '../../supabase/functions/_shared/set-report';

export function describeParsedSet(parsed: ParsedSet, units: Units = 'metric'): string {
  if (parsed.unit === 'seconds') {
    return parsed.reps >= 60 && parsed.reps % 60 === 0
      ? `${parsed.reps / 60} min`
      : `${parsed.reps}s held`;
  }
  return parsed.weight === null
    ? `${parsed.reps} reps · bodyweight`
    : `${kgToDisplayWeight(parsed.weight, units)} × ${parsed.reps} reps`;
}

export function looksLikeSetReport(
  raw: string,
  units: Units = 'metric',
  options: ParseSetOptions = {},
): boolean {
  if (parseSetReport(raw, units, options) !== null) return true;
  return /\b(done|complete|completed|finished)\b/i.test(raw);
}
