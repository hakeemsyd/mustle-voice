import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { localDateKey } from '../lib/resolveTodaySession';

/**
 * Calls `onRollover` the moment the user's own local calendar day changes.
 *
 * Everything that answers "what's due today" is keyed on the local date, but nothing ever
 * re-asked once the screen had loaded — Home refetched on navigation focus, when a voice call
 * ended, or when the coach changed something, and none of those fire at midnight. An app left
 * open across the boundary kept showing yesterday's session, and this codebase's own test data
 * shows sessions being run at 23:59 and 00:13, so the boundary is not a rare edge case here.
 *
 * Two triggers, because neither is sufficient alone:
 *  - A timer to the next local midnight, for the app sitting open as the day turns.
 *  - AppState returning to `active`, because iOS suspends timers in the background: an app
 *    backgrounded at 11pm and reopened the next morning would otherwise never have fired one.
 *
 * Both are guarded by an actual date-key comparison rather than firing blind, so returning to
 * the foreground within the same day costs nothing.
 */
export const useLocalDayRollover = (onRollover: () => void) => {
  const onRolloverRef = useRef(onRollover);
  onRolloverRef.current = onRollover;

  useEffect(() => {
    let dayKey = localDateKey(new Date());
    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = () => {
      const current = localDateKey(new Date());
      if (current === dayKey) return;
      dayKey = current;
      onRolloverRef.current();
    };

    const scheduleNextMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      // A second past the boundary, so the fire can never land a few milliseconds early and read
      // the previous date — which would skip the rollover until whatever happened to refetch next.
      timer = setTimeout(() => {
        check();
        scheduleNextMidnight();
      }, midnight.getTime() - now.getTime() + 1_000);
    };

    scheduleNextMidnight();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);
};
