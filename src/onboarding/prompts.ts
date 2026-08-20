// Exact coach-question text for each voice onboarding screen, shared between the screen
// itself (its `coachMessage` prop) and the prefetch calls in OnboardingFlow.tsx — the TTS
// cache is keyed on this exact string, so a screen and its prefetch must use the same
// constant, never a hand-copied literal that could drift.

export const MIC_PROMPT = "Talk to me. That's how we train.";
export const NAME_PROMPT = "Hey — what's your name?";
export const GOAL_PROMPT = "What are you actually trying to get out of this? Be honest.";
export const FREQUENCY_PROMPT =
  "How many days a week can you actually train — realistic, not aspirational?";
export const BIOMETRICS_PROMPT = "What's your height and weight? Rough numbers are fine.";
export const INJURIES_PROMPT = "Any injuries or areas I should avoid?";
export const PUSH_PROMPT = "I'll check in with you on rest days and keep you on track — cool?";

export const historyPrompt = (userName: string): string =>
  `Nice to meet you, ${userName}. How long have you been lifting — if at all?`;

// Every prompt whose text is known before the flow even starts — safe to prefetch as soon
// as onboarding mounts. HISTORY_PROMPT is deliberately excluded: it depends on the name
// answer, so it's prefetched separately the moment that answer is captured.
export const STATIC_ONBOARDING_PROMPTS = [
  MIC_PROMPT,
  NAME_PROMPT,
  GOAL_PROMPT,
  FREQUENCY_PROMPT,
  BIOMETRICS_PROMPT,
  INJURIES_PROMPT,
  PUSH_PROMPT,
];
