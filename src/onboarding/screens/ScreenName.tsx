import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";

interface ScreenNameProps {
  onNext: (name: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenName = ({ onNext, onBack, forceTypeMode }: ScreenNameProps) => {
  return (
    <ConversationalScreen
      coachMessage="Hey — what's your name?"
      autoFillText="Alex"
      typeInputPlaceholder="Your name"
      dotIndex={3}
      showBack
      onBack={onBack}
      onComplete={onNext}
      forceTypeMode={forceTypeMode}
    />
  );
};
