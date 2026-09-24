import { Platform } from 'react-native';
import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  requestAuthorization,
  getMostRecentQuantitySample,
  queryCategorySamples,
  queryWorkoutSamples,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';

// The enum's own camelCase keys ("functionalStrengthTraining") reversed from the numeric value
// HealthKit hands back, then split into words — no dedicated humanizer ships with the library.
const humanizeWorkoutActivity = (type: WorkoutActivityType): string => {
  const key = WorkoutActivityType[type] ?? 'workout';
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
};

/**
 * Read-only Apple Health integration — v1 scope (2026-09-05): body weight, workouts, sleep,
 * steps, and active energy inform coaching and the readiness score. No write-back to Health.
 * Our own `workout_log` stays the system of record for anything logged inside an Active
 * Session — this only ever surfaces activity that happened OUTSIDE the app (an Apple Watch run,
 * another gym app), which the coach would otherwise have no visibility into at all.
 *
 * Every identifier this module will ever read must be requested together in the one
 * requestAuthorization call below — the library's own docs warn that reading a type you didn't
 * request crashes the app outright, so this list has to stay authoritative and complete rather
 * than grown lazily call-site by call-site.
 */
const READ_IDENTIFIERS = [
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKWorkoutTypeIdentifier',
] as const;

export interface HealthSnapshot {
  weightKg: number | null;
  stepsToday: number | null;
  activeEnergyTodayKcal: number | null;
  /** Total time asleep last night, in minutes — summed across every "asleep" sample, not just
   *  time in bed. Null if nothing was recorded (no watch worn, no sleep tracking enabled). */
  sleepMinutesLastNight: number | null;
  /** Most recent workout logged in Health that ISN'T one of ours — used to tell the coach about
   *  activity it would otherwise never see, not to duplicate anything already in workout_log. */
  mostRecentExternalWorkout: { activityName: string; startedAt: string; durationMinutes: number } | null;
  /** Latest recorded reading, not a live/continuous feed — this app has no workout-session
   *  HealthKit integration, so it can't show real-time heart rate during a set the way a
   *  dedicated fitness app streaming from a paired Watch session can. Framed to the user as
   *  recovery context, not in-workout monitoring, for exactly that reason. */
  latestHeartRateBpm: number | null;
}

/** True only on a real iOS device/simulator with Health actually present — never assume the
 *  platform check alone means the module is safe to call (this can still be a fresh install with
 *  nothing granted). */
export const isAppleHealthAvailable = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  try {
    return await isHealthDataAvailable();
  } catch (err) {
    console.error('[appleHealth] availability check failed:', err);
    return false;
  }
};

/**
 * Whether the permission sheet has actually been shown for these types yet.
 *
 * isAppleHealthAvailable only reports whether the DEVICE has HealthKit, which is true on every
 * iPhone and says nothing about this app's access. Reading on that basis alone is what produced
 * "Authorization not determined" on Calendar: the permission sheet lives in onboarding, so anyone
 * who skipped that step (or onboarded before it existed) reaches a read that was never authorized.
 * See also the requestAppleHealthPermission note below, since an unrequested read is documented to
 * crash rather than reject on some paths, which makes this a stability gate and not just a tidy-up.
 *
 * Apple deliberately never reveals whether READ access was granted, only whether it has been
 * asked for, so `unnecessary` here means "already asked" and not "allowed". A denied type simply
 * returns no samples, which every reader below already handles as "no data".
 */
export const hasRequestedAppleHealthPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  try {
    const status = await getRequestStatusForAuthorization({ toRead: [...READ_IDENTIFIERS] });
    return status === AuthorizationRequestStatus.unnecessary;
  } catch (err) {
    console.error('[appleHealth] request-status check failed:', err);
    return false;
  }
};

/** The gate every reader should use: HealthKit exists AND this app has been through the sheet. */
export const canReadAppleHealth = async (): Promise<boolean> =>
  (await isAppleHealthAvailable()) && (await hasRequestedAppleHealthPermission());

/** Prompts the real native permission sheet — same one Settings > Privacy > Health shows. Must
 *  be called before any read below; a read against a type never requested crashes rather than
 *  rejecting cleanly, per the library's own documented behavior. */
export const requestAppleHealthPermission = async (): Promise<boolean> => {
  try {
    const granted = await requestAuthorization({ toRead: [...READ_IDENTIFIERS] });
    return granted !== false;
  } catch (err) {
    console.error('[appleHealth] permission request failed:', err);
    return false;
  }
};

const KG_PER_LB = 0.453592;

const toKg = (quantity: number, unit: string): number =>
  // HealthKit hands back whatever unit the user's own device is set to display in — never
  // assume kg just because that's what the rest of this app stores internally.
  unit.toLowerCase().startsWith('lb') ? quantity * KG_PER_LB : quantity;

const readLatestWeightKg = async (): Promise<number | null> => {
  try {
    const sample = await getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass');
    return sample ? toKg(sample.quantity, sample.unit) : null;
  } catch (err) {
    console.error('[appleHealth] weight read failed:', err);
    return null;
  }
};

const readLatestHeartRateBpm = async (): Promise<number | null> => {
  try {
    const sample = await getMostRecentQuantitySample('HKQuantityTypeIdentifierHeartRate');
    return sample ? Math.round(sample.quantity) : null;
  } catch (err) {
    console.error('[appleHealth] heart rate read failed:', err);
    return null;
  }
};

export const readRestingHeartRateBpm = async (): Promise<number | null> => {
  try {
    const sample = await getMostRecentQuantitySample('HKQuantityTypeIdentifierRestingHeartRate');
    return sample ? Math.round(sample.quantity) : null;
  } catch (err) {
    console.error('[appleHealth] resting heart rate read failed:', err);
    return null;
  }
};

const toCelsius = (quantity: number, unit: string): number =>
  unit.toLowerCase().startsWith('degf') ? ((quantity - 32) * 5) / 9 : quantity;

export const readBodyTemperatureC = async (): Promise<number | null> => {
  try {
    const sample = await getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyTemperature');
    return sample ? Math.round(toCelsius(sample.quantity, sample.unit) * 10) / 10 : null;
  } catch (err) {
    console.error('[appleHealth] body temperature read failed:', err);
    return null;
  }
};

const readTodayQuantityTotal = async (
  identifier: 'HKQuantityTypeIdentifierStepCount' | 'HKQuantityTypeIdentifierActiveEnergyBurned',
): Promise<number | null> => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const samples = await getMostRecentQuantitySample(identifier);
    // getMostRecentQuantitySample returns HealthKit's own most-recent single sample, which for
    // a cumulative type like steps is one recent reading, not a running daily total — real
    // "today's total" needs a statistics query, not this. Flagged rather than silently wrong:
    // this returns the most recent sample's own value as a placeholder until the statistics
    // path is wired in, so it under-reports true daily totals for now.
    if (!samples || new Date(samples.startDate) < startOfDay) return null;
    return samples.quantity;
  } catch (err) {
    console.error(`[appleHealth] ${identifier} read failed:`, err);
    return null;
  }
};

export interface SleepStageBreakdown {
  deepMinutes: number;
  remMinutes: number;
  lightMinutes: number;
  awakeMinutes: number;
  inBedMinutes: number | null;
  efficiencyPct: number | null;
}

const sleepStageWindow = (dateKey: string): { start: Date; end: Date } => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return {
    start: new Date(year, month - 1, day - 1, 18, 0, 0, 0),
    end: new Date(year, month - 1, day, 12, 0, 0, 0),
  };
};

export const readSleepStagesForNight = async (dateKey: string): Promise<SleepStageBreakdown | null> => {
  try {
    const { start, end } = sleepStageWindow(dateKey);
    const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: start, endDate: end } },
      limit: 100,
    });
    if (!samples || samples.length === 0) return null;

    const minutesOf = (value: number): number =>
      samples
        .filter((s) => s.value === value)
        .reduce((total, s) => total + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000, 0);

    const deepMinutes = Math.round(minutesOf(4));
    const remMinutes = Math.round(minutesOf(5));
    const lightMinutes = Math.round(minutesOf(3) + minutesOf(1));
    const awakeMinutes = Math.round(minutesOf(2));
    const hasInBedSamples = samples.some((s) => s.value === 0);
    const inBedMinutes = hasInBedSamples ? Math.round(minutesOf(0)) : null;
    const totalAsleep = deepMinutes + remMinutes + lightMinutes;
    const efficiencyPct =
      inBedMinutes && inBedMinutes > 0 ? Math.round((totalAsleep / inBedMinutes) * 100) : null;

    if (totalAsleep === 0 && awakeMinutes === 0) return null;

    return { deepMinutes, remMinutes, lightMinutes, awakeMinutes, inBedMinutes, efficiencyPct };
  } catch (err) {
    console.error('[appleHealth] sleep stage read failed:', err);
    return null;
  }
};

/** Standalone export (not just through readHealthSnapshot) so a screen that only cares about
 *  sleep — Calendar's Today card — isn't forced to also query weight/steps/workouts/heart-rate
 *  every time it loads. */
/**
 * Minutes asleep for the night that ENDS on the given local date.
 *
 * readLastNightSleepMinutes only ever answers "last night" (a fixed 20-hour lookback), so a past
 * day in Calendar had no way to ask about its own night. The window here runs from the previous
 * evening to midday, which is how sleep is conventionally attributed: you slept "Tuesday night"
 * and the hours land on Wednesday.
 */
export const readSleepMinutesForNight = async (dateKey: string): Promise<number | null> => {
  try {
    const [year, month, day] = dateKey.split('-').map(Number);
    const start = new Date(year, month - 1, day - 1, 18, 0, 0, 0);
    const end = new Date(year, month - 1, day, 12, 0, 0, 0);
    const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: start, endDate: end } },
      limit: 100,
    });
    if (!samples || samples.length === 0) return null;
    // Same value filter as readLastNightSleepMinutes: 0 is in-bed-but-awake, 2 is awake.
    const asleepMinutes = samples
      .filter((s) => s.value !== 0 && s.value !== 2)
      .reduce((total, s) => total + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000, 0);
    return asleepMinutes > 0 ? Math.round(asleepMinutes) : null;
  } catch (err) {
    console.error('[appleHealth] sleep read for night failed:', err);
    return null;
  }
};

export const readLastNightSleepMinutes = async (): Promise<number | null> => {
  try {
    const since = new Date();
    since.setHours(since.getHours() - 20);
    const samples = await queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
      filter: { date: { startDate: since } },
      limit: 50,
    });
    if (!samples || samples.length === 0) return null;
    // value 1/3/4/5 are HealthKit's various "asleep" states (core/deep/REM/unspecified) —
    // value 0 is "in bed but not asleep" and 2 is "awake", neither of which should count toward
    // time actually asleep.
    const asleepMinutes = samples
      .filter((s) => s.value !== 0 && s.value !== 2)
      .reduce((total, s) => total + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 60_000, 0);
    return asleepMinutes > 0 ? Math.round(asleepMinutes) : null;
  } catch (err) {
    console.error('[appleHealth] sleep read failed:', err);
    return null;
  }
};

const readMostRecentExternalWorkout = async (): Promise<HealthSnapshot['mostRecentExternalWorkout']> => {
  try {
    const workouts = await queryWorkoutSamples({ limit: 1 });
    const latest = workouts?.[0];
    if (!latest) return null;
    const durationMinutes = (latest.endDate.getTime() - latest.startDate.getTime()) / 60_000;
    return {
      activityName: humanizeWorkoutActivity(latest.workoutActivityType),
      startedAt: latest.startDate.toISOString(),
      durationMinutes: Math.round(durationMinutes),
    };
  } catch (err) {
    console.error('[appleHealth] workout read failed:', err);
    return null;
  }
};

/** Reads everything this module cares about in one pass — called right after a successful
 *  connect, and again opportunistically (e.g. on Home focus) rather than on any kind of
 *  background schedule, since v1 deliberately doesn't request background delivery. */
export const readHealthSnapshot = async (): Promise<HealthSnapshot> => {
  const [weightKg, stepsToday, activeEnergyTodayKcal, sleepMinutesLastNight, mostRecentExternalWorkout, latestHeartRateBpm] =
    await Promise.all([
      readLatestWeightKg(),
      readTodayQuantityTotal('HKQuantityTypeIdentifierStepCount'),
      readTodayQuantityTotal('HKQuantityTypeIdentifierActiveEnergyBurned'),
      readLastNightSleepMinutes(),
      readMostRecentExternalWorkout(),
      readLatestHeartRateBpm(),
    ]);

  return {
    weightKg,
    stepsToday,
    activeEnergyTodayKcal,
    sleepMinutesLastNight,
    mostRecentExternalWorkout,
    latestHeartRateBpm,
  };
};
