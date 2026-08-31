import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { historyPrompt } from "../prompts";

interface ScreenHistoryProps {
  userName: string;
  onNext: (history: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

// Quick-tap chips matching the design (mustle-mvp's ScreenHistory.tsx) — missing from this port
// entirely before now.
const HISTORY_CHIPS = [{ label: "Beginner" }, { label: "Intermediate" }, { label: "Experienced" }];

export const ScreenHistory = ({
  userName,
  onNext,
  onBack,
  forceTypeMode,
}: ScreenHistoryProps) => {
  return (
    <ConversationalScreen
      coachMessage={historyPrompt(userName)}
      typeInputPlaceholder="e.g. 2"
      typeInputUnit="years"
      dotIndex={4}
      showBack
      onBack={onBack}
      onComplete={onNext}
      forceTypeMode={forceTypeMode}
      unifiedInput
      chips={HISTORY_CHIPS}
      orbSize={126}
    />
  );
};
