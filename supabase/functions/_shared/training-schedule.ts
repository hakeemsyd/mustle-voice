export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

export interface ScheduleSession {
  id: string;
  day_order: number;
  weekday: number | null;
}

export interface ScheduleLog {
  dateKey: string;
  at: string;
  plan_session_id: string | null;
  status?: string | null;
}

export type ScheduleDayKind = 'training' | 'rest' | 'chosen_rest' | 'not_started' | 'custom';

export type ScheduleDayStatus = 'completed' | 'partial' | 'missed' | 'due' | 'upcoming' | 'rest';

export interface ScheduleDay<S extends ScheduleSession> {
  dateKey: string;
  weekday: number;
  kind: ScheduleDayKind;
  session: S | null;
  log: ScheduleLog | null;
  status: ScheduleDayStatus;
}

const unfinished = (status: string | null | undefined): boolean => status === 'partial' || status === 'interrupted';

export const defaultTrainingDays = (daysPerWeek: number | null | undefined): number[] => {
  const count = Math.max(0, Math.min(7, Math.round(Number(daysPerWeek) || 0)));
  return MONDAY_FIRST.slice(0, count).sort((a, b) => a - b);
};

export const parseTrainingDays = (input: unknown): number[] | null => {
  if (!Array.isArray(input)) return null;
  const days = new Set<number>();
  for (const raw of input) {
    if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 6) {
      days.add(raw);
      continue;
    }
    if (typeof raw !== 'string') return null;
    const key = raw.trim().toLowerCase();
    const index = WEEKDAY_KEYS.findIndex((name) => name === key || name.slice(0, 3) === key.slice(0, 3));
    if (index === -1 || key.length < 3) return null;
    days.add(index);
  }
  return days.size > 0 ? [...days].sort((a, b) => a - b) : null;
};

export const resolveTrainingDays = (
  plan: { training_days?: number[] | null; days_per_week?: number | null } | null | undefined,
  sessions: ScheduleSession[] = [],
): number[] => {
  const pinned = sessions.filter((s) => s.weekday !== null && s.weekday !== undefined).map((s) => s.weekday as number);
  if (pinned.length > 0) return [...new Set(pinned)].sort((a, b) => a - b);
  const stored = parseTrainingDays(plan?.training_days ?? null);
  if (stored) return stored;
  return defaultTrainingDays(plan?.days_per_week || sessions.length);
};

export const isTrainingDay = (weekday: number, trainingDays: number[] | null | undefined): boolean =>
  !trainingDays || trainingDays.length === 0 || trainingDays.includes(weekday);

export const weekdayOfKey = (dateKey: string): number => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

export const addDaysToKey = (dateKey: string, days: number): string => {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export const weekdayLabel = (weekday: number): string => WEEKDAY_LABELS[weekday] ?? '';

export const describeTrainingDays = (trainingDays: number[]): string => {
  const ordered = MONDAY_FIRST.filter((d) => trainingDays.includes(d));
  const rest = MONDAY_FIRST.filter((d) => !trainingDays.includes(d));
  const names = (days: number[]) => days.map(weekdayLabel).join(', ');
  return rest.length === 0
    ? `Training days: every day (${names(ordered)}). No fixed rest day.`
    : `Training days: ${names(ordered)}. Rest days: ${names(rest)}.`;
};

export const firstTrainingDayOnOrAfter = (dateKey: string, trainingDays: number[]): string => {
  for (let offset = 0; offset < 7; offset++) {
    const key = addDaysToKey(dateKey, offset);
    if (isTrainingDay(weekdayOfKey(key), trainingDays)) return key;
  }
  return dateKey;
};

const newestFirst = (a: ScheduleLog, b: ScheduleLog): number => {
  const byTime = new Date(b.at).getTime() - new Date(a.at).getTime();
  if (byTime !== 0) return byTime;
  return Number(unfinished(a.status)) - Number(unfinished(b.status));
};

const lastRotationIndex = <S extends ScheduleSession>(rotation: S[], logs: ScheduleLog[]): number | null => {
  const ids = rotation.map((s) => s.id);
  const last = logs
    .slice()
    .sort(newestFirst)
    .find((log) => log.plan_session_id && ids.includes(log.plan_session_id));
  if (!last) return null;
  const index = ids.indexOf(last.plan_session_id as string);
  return index === -1 ? null : index;
};

const dayLog = (logs: ScheduleLog[], dateKey: string): ScheduleLog | null =>
  logs
    .filter((log) => log.dateKey === dateKey)
    .sort((a, b) => Number(unfinished(a.status)) - Number(unfinished(b.status)) || newestFirst(a, b))[0] ?? null;

export function projectSchedule<S extends ScheduleSession>(input: {
  sessions: S[];
  trainingDays: number[];
  logs: ScheduleLog[];
  restDayDates: Set<string>;
  activeFromKey: string | null;
  todayKey: string;
  todayDue: S | null;
  todayOverride?: S | null;
  fromKey: string;
  toKey: string;
  extraSessions?: S[];
}): ScheduleDay<S>[] {
  const { sessions, trainingDays, logs, restDayDates, activeFromKey, todayKey, todayDue, fromKey, toKey } = input;
  const pinned = sessions.some((s) => s.weekday !== null && s.weekday !== undefined);
  const rotation = sessions.slice().sort((a, b) => a.day_order - b.day_order);
  const lookup = new Map<string, S>([...(input.extraSessions ?? []), ...sessions].map((s) => [s.id, s]));
  const hasPlan = sessions.length > 0;

  const dueOnPastDay = (dateKey: string, weekday: number): S | null => {
    if (pinned) return sessions.find((s) => s.weekday === weekday) ?? null;
    if (rotation.length === 0) return null;
    const index = lastRotationIndex(rotation, logs.filter((log) => log.dateKey < dateKey));
    return rotation[index === null ? 0 : (index + 1) % rotation.length];
  };

  const todayDueIndex = todayDue && !pinned ? rotation.findIndex((s) => s.id === todayDue.id) : -1;
  let pointer: number;
  if (todayDueIndex !== -1) {
    pointer = todayDueIndex + 1;
  } else {
    const index = lastRotationIndex(rotation, logs.filter((log) => log.dateKey <= todayKey));
    pointer = index === null ? 0 : index + 1;
  }

  const days: ScheduleDay<S>[] = [];
  const walkFrom = fromKey > todayKey ? addDaysToKey(todayKey, 1) : fromKey;
  for (let key = walkFrom; key <= toKey; key = addDaysToKey(key, 1)) {
    const emit = key >= fromKey;
    const weekday = weekdayOfKey(key);
    const log = dayLog(logs, key);
    const loggedSession = log?.plan_session_id ? (lookup.get(log.plan_session_id) ?? null) : null;
    const notStarted = !hasPlan || (!!activeFromKey && key < activeFromKey);
    const training = hasPlan && isTrainingDay(weekday, trainingDays);
    const loggedStatus: ScheduleDayStatus | null = log ? (unfinished(log.status) ? 'partial' : 'completed') : null;
    const baseKind: ScheduleDayKind = notStarted
      ? 'not_started'
      : restDayDates.has(key)
        ? 'chosen_rest'
        : training
          ? 'training'
          : 'rest';

    if (key === todayKey) {
      const override = input.todayOverride ?? null;
      if (override && todayDue?.id === override.id) {
        days.push({ dateKey: key, weekday, kind: 'custom', session: override, log, status: loggedStatus ?? 'due' });
      } else if (todayDue) {
        days.push({ dateKey: key, weekday, kind: 'training', session: todayDue, log, status: loggedStatus ?? 'due' });
      } else if (log) {
        days.push({ dateKey: key, weekday, kind: baseKind, session: loggedSession, log, status: loggedStatus! });
      } else {
        days.push({ dateKey: key, weekday, kind: baseKind, session: null, log: null, status: 'rest' });
      }
      continue;
    }

    if (key < todayKey) {
      if (log) {
        days.push({ dateKey: key, weekday, kind: baseKind, session: loggedSession, log, status: loggedStatus! });
      } else if (baseKind === 'training') {
        days.push({ dateKey: key, weekday, kind: 'training', session: dueOnPastDay(key, weekday), log: null, status: 'missed' });
      } else {
        days.push({ dateKey: key, weekday, kind: baseKind, session: null, log: null, status: 'rest' });
      }
      continue;
    }

    if (baseKind !== 'training') {
      if (emit) days.push({ dateKey: key, weekday, kind: baseKind, session: null, log: null, status: 'rest' });
      continue;
    }
    const session = pinned
      ? (sessions.find((s) => s.weekday === weekday) ?? null)
      : rotation.length > 0
        ? rotation[pointer++ % rotation.length]
        : null;
    if (emit) days.push({ dateKey: key, weekday, kind: 'training', session, log: null, status: 'upcoming' });
  }
  return days;
}
