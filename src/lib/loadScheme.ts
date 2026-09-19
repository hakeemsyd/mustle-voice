import type { Units } from './units';

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
