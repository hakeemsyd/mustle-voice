import React from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { normalizeSpokenNumbers } from "../normalizeSpokenNumbers";

interface ScreenFrequencyProps {
  onNext: (days: number | null) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenFrequency = ({
  onNext,
  onBack,
  forceTypeMode,
}: ScreenFrequencyProps) => {
  return (
    <ConversationalScreen
      coachMessage="How many days a week can you actually train — realistic, not aspirational?"
      typeInputPlaceholder="e.g. 4"
      typeInputUnit="days / week"
      dotIndex={6}
      showBack
      onBack={onBack}
      onComplete={(value) => {
        const match = value.match(/\d+/);
        onNext(match ? parseInt(match[0], 10) : null);
      }}
      formatAnswer={normalizeSpokenNumbers}
      forceTypeMode={forceTypeMode}
    />
  );
};
