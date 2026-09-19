const RECOVERABLE = /failed to send a request|network request failed|timed? ?out|aborted|load failed/i;

export const looksRecoverable = (message: string): boolean => RECOVERABLE.test(message);
