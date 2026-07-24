import React, { useCallback, useState } from "react";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { BodyDiagram } from "./BodyDiagram";

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

  const handleComplete = useCallback(() => {
    onNext(Array.from(selected), description.trim() || undefined);
  }, [selected, description, onNext]);

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
      coachMessage="Any injuries or areas I should avoid?"
      autoFillText="Right shoulder from an old rotator cuff issue — nothing heavy overhead. Lower back gets tight after deadlifts so I avoid going too heavy. Left knee's a bit dodgy on deep squats."
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
