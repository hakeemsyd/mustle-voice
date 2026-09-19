import { getTimeBand } from '../screens/homeFormat';

export interface StoredGreeting {
  at: string;
  greeting_key: string | null;
}

export interface GreetingFreshnessInput {
  lastGreeting: StoredGreeting | null;
  greetingKey: string | null | undefined;
  mostRecentWorkoutAt: string | null;
  planCreatedAt: string | null;
  now?: Date;
}

const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const greetingIsFreshToday = ({
  lastGreeting,
  greetingKey,
  mostRecentWorkoutAt,
  planCreatedAt,
  now = new Date(),
}: GreetingFreshnessInput): boolean => {
  if (!lastGreeting) return false;
  const writtenAt = new Date(lastGreeting.at);
  return (
    dayKey(writtenAt) === dayKey(now) &&
    getTimeBand(writtenAt.getHours()) === getTimeBand(now.getHours()) &&
    lastGreeting.greeting_key === greetingKey &&
    (!mostRecentWorkoutAt || new Date(mostRecentWorkoutAt) <= writtenAt) &&
    (!planCreatedAt || new Date(planCreatedAt) <= writtenAt)
  );
};
