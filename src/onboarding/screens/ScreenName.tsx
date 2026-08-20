import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { extractSpokenName } from "../extractSpokenName";
import { NAME_PROMPT } from "../prompts";

interface ScreenNameProps {
  onNext: (name: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenName = ({ onNext, onBack, forceTypeMode }: ScreenNameProps) => {
  return (
    <ConversationalScreen
      coachMessage={NAME_PROMPT}
      typeInputPlaceholder="Your name"
      dotIndex={3}
      showBack
      onBack={onBack}
      onComplete={onNext}
      formatAnswer={extractSpokenName}
      forceTypeMode={forceTypeMode}
    />
  );
};
