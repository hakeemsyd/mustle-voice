import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { historyPrompt } from "../prompts";

interface ScreenHistoryProps {
  userName: string;
  onNext: (history: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

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
    />
  );
};
