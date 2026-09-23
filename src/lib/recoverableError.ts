const RECOVERABLE = /failed to send a request|network request failed|timed? ?out|aborted|load failed|non-2xx/i;

export const looksRecoverable = (message: string): boolean => RECOVERABLE.test(message);

const statusOf = (error: unknown): number | null => {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === 'number' ? status : null;
};

export const worthRecovering = (error: { message: string }): boolean => {
  const status = statusOf(error);
  if (status === null) return looksRecoverable(error.message);
  if (status === 408 || status === 429) return true;
  return status >= 500;
};
