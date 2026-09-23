export const CONSULTATION_TOPICS = ['equipment', 'diet', 'schedule', 'goals_injuries'] as const;
export type ConsultationTopic = (typeof CONSULTATION_TOPICS)[number];

const TOPIC_LABEL: Record<ConsultationTopic, string> = {
  equipment: 'where they train and what equipment they have access to',
  diet: 'their current diet/eating pattern, restrictions and preferences',
  schedule: 'which days and roughly what time of day/how much time they have available',
  goals_injuries: 'any goal or injury detail that is still unclear',
};

export function missingConsultationTopics(coveredTopics: string[]): ConsultationTopic[] {
  const covered = new Set(coveredTopics);
  return CONSULTATION_TOPICS.filter((topic) => !covered.has(topic));
}

export function describeConsultationStatus(
  hasActivePlan: boolean,
  coveredTopics: string[],
): string | null {
  if (hasActivePlan) return null;

  const missing = missingConsultationTopics(coveredTopics);
  if (missing.length === 0) {
    return (
      'No active training plan yet, but every consultation topic is already covered — call ' +
      'generate_training_plan when ready.'
    );
  }

  return (
    'No active training plan yet — before proposing one with generate_training_plan, make sure ' +
    "you've naturally covered: " +
    missing.map((topic) => TOPIC_LABEL[topic]).join('; ') +
    ". Use what onboarding already told you — their free-text training history, goal, and injury " +
    'notes are already in this conversation as earlier messages — so you never ask them to repeat ' +
    "something they already said. Ask about what's still genuinely missing, naturally, a question " +
    'or two at a time, never a rigid checklist. Call note_consultation_covered the moment each is ' +
    'resolved (a clear "I don\'t know, use your judgment" counts as resolved too).'
  );
}
