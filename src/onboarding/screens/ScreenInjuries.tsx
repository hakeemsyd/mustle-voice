import React, { useCallback, useState } from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { BodyDiagram } from "./BodyDiagram";
import { INJURIES_PROMPT } from "../prompts";

interface ScreenInjuriesProps {
  onNext: (injuries: string[], description?: string) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenInjuries = ({
  onNext,
  onBack,
  forceTypeMode,
}: ScreenInjuriesProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [description, setDescription] = useState("");

  const handleComplete = useCallback(
    (spokenAnswer: string) => {
      const finalDescription = description.trim() || spokenAnswer.trim();
      onNext(Array.from(selected), finalDescription || undefined);
    },
    [selected, description, onNext],
  );

  const typeSlot = (
    <BodyDiagram
      selected={selected}
      onChange={setSelected}
      description={description}
      onDescriptionChange={setDescription}
    />
  );

  return (
    <ConversationalScreen
      coachMessage={INJURIES_PROMPT}
      typeSlot={typeSlot}
      typeValid={true}
      dotIndex={8}
      showBack
      onBack={onBack}
      onComplete={handleComplete}
      forceTypeMode={forceTypeMode}
    />
  );
};
