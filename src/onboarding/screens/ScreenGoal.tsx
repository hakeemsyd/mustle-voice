import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { GOAL_PROMPT } from "../prompts";

interface ScreenGoalProps {
  onNext: (goal: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenGoal = ({ onNext, onBack, forceTypeMode }: ScreenGoalProps) => {
  return (
    <ConversationalScreen
      coachMessage={GOAL_PROMPT}
      dotIndex={5}
      showBack
      onBack={onBack}
      onComplete={onNext}
      forceTypeMode={forceTypeMode}
    />
  );
};
