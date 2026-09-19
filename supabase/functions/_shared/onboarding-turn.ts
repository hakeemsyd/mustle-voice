const ONBOARDING_SETUP_PREFIX = 'I just finished onboarding';

export const isOnboardingSetupTurn = (
  message: unknown,
  hidden: boolean,
  isDailyGreeting: boolean,
): boolean =>
  hidden === true &&
  isDailyGreeting !== true &&
  typeof message === 'string' &&
  message.startsWith(ONBOARDING_SETUP_PREFIX);
