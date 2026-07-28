import { normalizeSpokenNumbers } from "./normalizeSpokenNumbers";

/**
 * Normalizes a spoken height/weight answer (e.g. "Five foot eight inch, one seventy six pounds")
 * into a clean display form (e.g. "5'8", 176 lbs") for both the on-screen confirmation and
 * downstream digit parsing.
 */
export const formatBiometricsAnswer = (rawTranscript: string): string => {
  let text = normalizeSpokenNumbers(rawTranscript);

  const beforeHeight = text;
  text = text.replace(
    /(\d+)\s*(?:feet|foot|ft)\.?\s*(\d+)?\s*(?:inch(?:es)?|in)?\.?/gi,
    (_match, feet: string, inches?: string) => (inches ? `${feet}'${inches}"` : `${feet}'`),
  );

  // fallback for "five eleven" style height with no "foot"/"inch" words: two adjacent bare
  // numbers where the first looks like feet (3-8) and the second like inches (0-11).
  if (text === beforeHeight) {
    text = text.replace(
      /\b([3-8])\s+(\d|1[01])\b(?!['"]|\s*(?:lbs?|kgs?|pounds?|kilograms?))/,
      (_match, feet: string, inches: string) => `${feet}'${inches}"`,
    );
  }

  text = text.replace(
    /(\d+)\s*(?:pounds|pound|lbs|lb)\.?/gi,
    (_match, lbs: string) => `${lbs} lbs`,
  );

  text = text.replace(
    /(\d+)\s*(?:kilograms|kilogram|kgs|kg)\.?/gi,
    (_match, kg: string) => `${kg} kg`,
  );

  return text;
};

/**
 * Extracts height/weight/units from a string already run through `formatBiometricsAnswer`
 * (e.g. "5'8", 176 lbs"). Falls back to bare numbers if the feet/lbs markers aren't present.
 */
export const parseFormattedBiometrics = (
  formatted: string,
): { height: string | null; weight: string | null; units: "metric" | "imperial" | null } => {
  const heightMatch = formatted.match(/(\d+)'(\d+)?"?/);
  const weightMatch = formatted.match(/(\d+(?:\.\d+)?)\s*(lbs|kg)\b/i);

  const height = heightMatch
    ? heightMatch[2]
      ? `${heightMatch[1]}'${heightMatch[2]}"`
      : `${heightMatch[1]}'`
    : null;

  const units = weightMatch?.[2]?.toLowerCase() === "kg" ? "metric" : null;
  let weight = weightMatch?.[1] ?? null;

  if (!height && !weight) {
    const numbers = formatted.match(/\d+(?:\.\d+)?/g) ?? [];
    return { height: numbers[0] ?? null, weight: numbers[1] ?? null, units: null };
  }

  if (!weight) {
    const withoutHeight = heightMatch ? formatted.replace(heightMatch[0], "") : formatted;
    weight = (withoutHeight.match(/\d+(?:\.\d+)?/g) ?? [])[0] ?? null;
  }

  if (!height) {
    const withoutWeight = weightMatch ? formatted.replace(weightMatch[0], "") : formatted;
    const numbers = withoutWeight.match(/\d+(?:\.\d+)?/g) ?? [];
    return { height: numbers[0] ?? null, weight, units };
  }

  return { height, weight, units };
};
