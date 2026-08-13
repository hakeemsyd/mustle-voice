import { useEffect, useState } from 'react';

/**
 * Seconds remaining in a rest period, ticking every second off a shared wall-clock end
 * timestamp — so every component reading it (the full-screen panel, the minimized pill)
 * shows the same live number instead of each owning a private countdown that drifts out
 * of sync with the others. Wall-clock based rather than tick-accumulated, so a stalled JS
 * timer (backgrounding, a slow render) self-corrects instead of drifting.
 *
 * `restEndAt` null means not actively counting down; `pausedRemainingSec` (also from
 * context) overrides with a frozen value while paused.
 */
export function useRestRemaining(restEndAt: number | null, pausedRemainingSec: number | null): number {
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (restEndAt === null) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [restEndAt]);

  if (pausedRemainingSec !== null) return pausedRemainingSec;
  if (restEndAt === null) return 0;
  return Math.max(0, Math.round((restEndAt - Date.now()) / 1000));
}
