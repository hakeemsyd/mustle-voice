import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { GOAL_PROMPT } from "../prompts";

interface ScreenGoalProps {
  onNext: (goal: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

// The 3 chips currently live in the design (mustle-mvp's ScreenGoal.tsx) — that repo's own
// comment flags this specific choice of which 3 as Vlad's own unconfirmed call, still pending
// Damion's sign-off. Using them here as the working default; swap if he picks differently.
const GOAL_CHIPS = [{ label: "Lose body fat" }, { label: "Build muscle" }, { label: "Get stronger" }];

export const ScreenGoal = ({ onNext, onBack, forceTypeMode }: ScreenGoalProps) => {
  return (
    <ConversationalScreen
      coachMessage={GOAL_PROMPT}
      dotIndex={5}
      showBack
      onBack={onBack}
      onComplete={onNext}
      forceTypeMode={forceTypeMode}
      chips={GOAL_CHIPS}
      chipsMultiSelect
      unifiedInput
      orbSize={126}
    />
  );
};
