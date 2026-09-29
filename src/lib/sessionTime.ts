export const RESUME_GAP_LIMIT_SEC = 60 * 60;

export const resumeElapsedSec = (savedSec: number | null | undefined, startedAtIso: string | null | undefined, now: number): number => {
  const saved = Math.max(0, Math.round(savedSec ?? 0));
  const started = startedAtIso ? Date.parse(startedAtIso) : NaN;
  const wall = Math.round((now - started) / 1000);
  if (!Number.isFinite(wall) || wall <= saved) return saved;
  return wall - saved <= RESUME_GAP_LIMIT_SEC ? wall : saved;
};
