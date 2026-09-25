export const LB_PER_KG = 2.20462;

const STORAGE_ERROR_LB = 0.12;

export const kgToLb = (kg: number): number => {
  const lb = kg * LB_PER_KG;
  const half = Math.round(lb * 2) / 2;
  return Math.abs(lb - half) <= STORAGE_ERROR_LB ? half : Math.round(lb * 10) / 10;
};
