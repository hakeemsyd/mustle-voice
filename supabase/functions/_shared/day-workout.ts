import { humanizeFocus } from './humanize.ts';
import { DAY_RANGE_FUTURE, DAY_RANGE_PAST, describeDayKey, findDayMentions, resolveDayPhrase, shortDayLabel } from './day-phrase.ts';
import { addDaysToKey, projectSchedule, type ScheduleLog, type ScheduleSession } from './training-schedule.ts';

export interface DayWorkoutSession extends ScheduleSession {
  focus: string | null;
  plan_exercise?: { ord: number; sets?: number | null; rep_scheme?: string | null; exercise?: { name?: string } | null }[] | null;
}

export interface DayScheduleInput<S extends DayWorkoutSession> {
  todayKey: string;
  sessions: S[];
  trainingDays: number[];
  logs: ScheduleLog[];
  restDayDates: Set<string>;
  activeFromKey: string | null;
  todayDue: S | null;
  todayOverride: S | null;
  restSecondsFor: (repScheme: string | null) => number;
}

export interface DayWorkoutInput<S extends DayWorkoutSession> extends DayScheduleInput<S> {
  day?: string | null;
}

const projectDays = <S extends DayWorkoutSession>(input: DayScheduleInput<S>, fromKey: string, toKey: string) =>
  projectSchedule({
    sessions: input.sessions,
    trainingDays: input.trainingDays,
    logs: input.logs,
    restDayDates: input.restDayDates,
    activeFromKey: input.activeFromKey,
    todayKey: input.todayKey,
    todayDue: input.todayDue,
    todayOverride: input.todayOverride,
    fromKey,
    toKey,
    extraSessions: input.todayOverride ? [input.todayOverride] : [],
  });

export const nextTrainingDayAfter = <S extends DayWorkoutSession>(input: DayScheduleInput<S>, afterKey: string): string | null => {
  const next = projectDays(input, addDaysToKey(afterKey, 1), addDaysToKey(afterKey, 14)).find(
    (d) => d.kind === 'training' && d.session,
  );
  return next ? `${describeDayKey(next.dateKey, input.todayKey)} (${focusOf(next.session)})` : null;
};

const focusOf = (session: DayWorkoutSession | null): string | null =>
  session?.focus ? humanizeFocus(session.focus) : null;

const cardFor = <S extends DayWorkoutSession>(session: S, dateKey: string, todayKey: string, restSecondsFor: (r: string | null) => number) => {
  const exercises = (session.plan_exercise ?? [])
    .slice()
    .sort((a, b) => a.ord - b.ord)
    .map((e) => ({
      name: e.exercise?.name ?? '',
      sets: e.sets ?? 1,
      reps: e.rep_scheme ?? '',
      rest_sec: restSecondsFor(e.rep_scheme ?? null),
    }));
  return {
    type: 'daily_workout' as const,
    plan_session_id: session.id,
    date_key: dateKey,
    is_today: dateKey === todayKey,
    day_label: `${shortDayLabel(dateKey, todayKey)} · ${focusOf(session)}`,
    estimated_minutes: Math.round(exercises.reduce((total, e) => total + e.sets * (40 + e.rest_sec), 0) / 60),
    exercises,
  };
};

export const lookupDayWorkout = <S extends DayWorkoutSession>(input: DayWorkoutInput<S>) => {
  const { day, todayKey, sessions, todayOverride } = input;
  const requested = String(day ?? '').trim();
  const resolved = resolveDayPhrase(requested, todayKey);
  if ('error' in resolved) {
    return resolved.error === 'unclear'
      ? {
          status: 'not_understood',
          requested_day: requested,
          instruction:
            `Could not tell which date "${requested}" means. Ask which day they mean (a weekday like ` +
            '"Sunday" or a date like "Oct 15"). Do not guess a date or describe a workout.',
        }
      : {
          status: 'not_in_range',
          requested_day: requested,
          instruction:
            `Only days from ${DAY_RANGE_PAST} days ago to ${DAY_RANGE_FUTURE} days ahead can be looked up. ` +
            'Say so and offer to check a closer day.',
        };
  }

  const dateKey = resolved.dateKey;
  const dayName = describeDayKey(dateKey, todayKey);
  const isToday = dateKey === todayKey;
  if (sessions.length === 0 && !(isToday && todayOverride)) {
    return { status: 'no_session', reason: 'no_active_plan', date: dateKey, day: dayName, summary: 'No active training plan.' };
  }

  const target = projectDays(input, dateKey, dateKey)[0];

  if (target.kind === 'not_started') {
    return {
      status: 'no_session',
      reason: 'plan_not_started',
      date: dateKey,
      day: dayName,
      plan_starts_on: input.activeFromKey,
      summary: input.activeFromKey
        ? `Before their plan starts (${describeDayKey(input.activeFromKey, todayKey)}), so nothing is scheduled.`
        : 'Nothing is scheduled.',
      instruction: input.activeFromKey
        ? `Their plan starts on ${describeDayKey(input.activeFromKey, todayKey)}, so nothing is scheduled on ${dayName}.`
        : `Nothing is scheduled on ${dayName}.`,
    };
  }

  if (dateKey < todayKey) {
    const outcome = target.status === 'rest' ? 'rest' : target.status;
    const focus = focusOf(target.session);
    const summary =
      outcome === 'completed'
        ? `They completed ${focus ?? 'a workout'}.`
        : outcome === 'partial'
          ? `They started ${focus ?? 'a workout'} but did not finish it.`
          : outcome === 'missed'
            ? `${focus ?? 'A session'} was due and nothing was logged.`
            : target.kind === 'chosen_rest'
              ? 'A rest day they chose to take.'
              : 'A rest day in their plan.';
    return {
      status: 'past_day',
      date: dateKey,
      day: dayName,
      outcome,
      session: focus,
      summary,
      instruction: `${dayName}: ${summary} That day is over, so there is no workout card to start. Tell them in one sentence and name the date.`,
    };
  }

  if (target.kind === 'rest' || target.kind === 'chosen_rest' || !target.session) {
    const nextLine = nextTrainingDayAfter(input, dateKey);
    return {
      status: 'no_session',
      reason: target.kind === 'chosen_rest' ? 'chosen_rest_day' : 'rest_day',
      date: dateKey,
      day: dayName,
      next_training_day: nextLine,
      summary:
        `A rest day${target.kind === 'chosen_rest' ? ' they chose to take' : ' in their plan'}.` +
        (nextLine ? ` Next training day after it: ${nextLine}.` : ''),
      instruction:
        `${dayName} is a rest day${target.kind === 'chosen_rest' ? ' they chose to take' : ' in their plan'}. ` +
        'Say so and name the date; do not describe or invent a workout for it.' +
        (nextLine ? ` Their next training day after it is ${nextLine}.` : ''),
    };
  }

  const card = cardFor(target.session, dateKey, todayKey, input.restSecondsFor);
  return {
    status: 'shown',
    date: dateKey,
    day: dayName,
    ...(isToday && target.status === 'completed' ? { completed_today: true } : {}),
    summary: `Scheduled: ${focusOf(target.session)} (${card.exercises.map((e) => e.name).filter(Boolean).join(', ') || 'no exercises listed'}).`,
    ...(isToday
      ? {}
      : {
          instruction:
            `This is the session scheduled for ${dayName}. Name that date in your sentence.` +
            (sessions.some((s) => s.weekday !== null && s.weekday !== undefined)
              ? ''
              : ' If they skip or add a training day before then, the rotation moves with them.'),
        }),
    card,
  };
};

export const describeDayMentions = <S extends DayWorkoutSession>(
  text: string | null | undefined,
  input: DayScheduleInput<S>,
  historyFromKey: string | null,
): string | null => {
  const mentions = findDayMentions(text, input.todayKey);
  if (mentions.length === 0) return null;
  const lines = mentions.map(({ phrase, dateKey }) => {
    const dayName = describeDayKey(dateKey, input.todayKey);
    const past = dateKey < input.todayKey;
    if (past && historyFromKey && dateKey < historyFromKey) {
      return `"${phrase}" is ${dayName}, older than the workout history loaded here: call show_daily_workout with day "${phrase}" before saying what happened that day.`;
    }
    const result = lookupDayWorkout({ ...input, day: dateKey });
    return `"${phrase}" is ${dayName}${past ? ' (already over)' : ''}. ${'summary' in result ? result.summary : ''}`.trim();
  });
  return (
    "Days named in the user's message, worked out by the app from the same schedule Home and the Calendar use. " +
    'These are facts: answer from them, never work out a different date, and never say you cannot see a day. ' +
    lines.join(' ') +
    ' In text chat, show_daily_workout with day set to their words shows a future day as a card.'
  );
};
