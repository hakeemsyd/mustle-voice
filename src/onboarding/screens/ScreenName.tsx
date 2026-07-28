import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { extractSpokenName } from "../extractSpokenName";

interface ScreenNameProps {
  onNext: (name: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenName = ({ onNext, onBack, forceTypeMode }: ScreenNameProps) => {
  return (
    <ConversationalScreen
      coachMessage="Hey — what's your name?"
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
