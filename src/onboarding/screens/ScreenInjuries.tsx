import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { ConversationalScreen } from "../../components/ConversationalScreen";
import { BottomSheet } from "../../components/BottomSheet";
import { BodyDiagram } from "./BodyDiagram";
import { INJURIES_PROMPT } from "../prompts";
import { colors, fonts } from "../../constants/theme";

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
  const [mapOpen, setMapOpen] = useState(false);

  const triggerLabel =
    selected.size > 0
      ? `${selected.size} area${selected.size > 1 ? "s" : ""} marked`
      : "Mark on body map";

  const handleComplete = useCallback(
    (capturedAnswer: string) => {
      const description = capturedAnswer.trim();
      onNext(Array.from(selected), description || undefined);
    },
    [selected, onNext],
  );

  const bodyMapTrigger = (
    <Pressable
      style={[styles.mapTrigger, selected.size > 0 && styles.mapTriggerActive]}
      onPress={() => setMapOpen(true)}
    >
      <MaterialIcons
        name="accessibility"
        size={14}
        color={selected.size > 0 ? colors.accent : "rgba(255,255,255,0.6)"}
      />
      <Text
        style={[
          styles.mapTriggerText,
          selected.size > 0 && styles.mapTriggerTextActive,
        ]}
      >
        {triggerLabel}
      </Text>
    </Pressable>
  );

  return (
    <>
      <ConversationalScreen
        coachMessage={INJURIES_PROMPT}
        belowMessageSlot={bodyMapTrigger}
        typeValid={true}
        dotIndex={8}
        showBack
        onBack={onBack}
        onComplete={handleComplete}
        forceTypeMode={forceTypeMode}
        unifiedInput
        orbSize={140}
        typeInputPlaceholder="Type your answer"
      />

      <BottomSheet
        visible={mapOpen}
        onClose={() => setMapOpen(false)}
        heightVariant="full"
      >
        <View style={styles.sheetInner}>
          <Text style={styles.sheetTitle}>Mark what's bothering you</Text>
          <Text style={styles.sheetSubtitle}>
            Tap areas to mark — or skip if none
          </Text>
          <BodyDiagram
            selected={selected}
            onChange={setSelected}
            description=""
            onDescriptionChange={() => {}}
            hideDescription
            size="large"
          />
          <Pressable style={styles.doneBtn} onPress={() => setMapOpen(false)}>
            <Text style={styles.doneBtnText}>DONE</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </>
  );
};

const styles = StyleSheet.create({
  mapTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  mapTriggerActive: {
    borderColor: "rgba(200,241,53,0.4)",
    backgroundColor: "rgba(200,241,53,0.1)",
  },
  mapTriggerText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  mapTriggerTextActive: {
    color: colors.accent,
    fontFamily: fonts.bodySemiBold,
  },
  sheetInner: {
    flex: 1,
    alignItems: "center",
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 28,
  },
  sheetTitle: {
    fontFamily: fonts.bodyExtraBold,
    fontSize: 19,
    color: colors.text,
    textAlign: "center",
  },
  sheetSubtitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    marginTop: -8,
  },
  doneBtn: {
    width: "100%",
    height: 52,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    marginTop: 4,
  },
  doneBtnText: {
    fontFamily: fonts.display,
    fontSize: 17,
    letterSpacing: 0.7,
    color: colors.bg,
  },
});
