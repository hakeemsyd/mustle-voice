import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";

interface ScreenGoalProps {
  onNext: (goal: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenGoal = ({ onNext, onBack, forceTypeMode }: ScreenGoalProps) => {
  return (
    <ConversationalScreen
      coachMessage="What are you actually trying to get out of this? Be honest."
      dotIndex={5}
      showBack
      onBack={onBack}
      onComplete={onNext}
      forceTypeMode={forceTypeMode}
    />
  );
};
