import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ConversationalScreen } from "../../components/ConversationalScreen";
import { ConversationAnswerCard } from "../../components/ConversationAnswerCard";
import { fonts } from "../../constants/theme";
import { formatBiometricsAnswer, parseFormattedBiometrics } from "../formatBiometricsAnswer";
import { BIOMETRICS_PROMPT } from "../prompts";

type Units = "metric" | "imperial";

interface ScreenBiometricsProps {
  onNext: (height: string, weight: string, units: Units) => void;
  onBack: () => void;
  forceTypeMode?: boolean;
}

export const ScreenBiometrics = ({
  onNext,
  onBack,
  forceTypeMode,
}: ScreenBiometricsProps) => {
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [units, setUnits] = useState<Units>("imperial");

  const isImperial = units === "imperial";
  const typeValid = height.trim().length > 0 && weight.trim().length > 0;

  const typeSlot = (
    <View>
      <View style={styles.unitToggle}>
        <Pressable
          style={[styles.unitBtn, !isImperial && styles.unitBtnActive]}
          onPress={() => setUnits("metric")}
        >
          <Text style={[styles.unitBtnText, !isImperial && styles.unitBtnTextActive]}>
            METRIC
          </Text>
        </Pressable>

        <Pressable
          style={[styles.unitBtn, isImperial && styles.unitBtnActive]}
          onPress={() => setUnits("imperial")}
        >
          <Text style={[styles.unitBtnText, isImperial && styles.unitBtnTextActive]}>
            IMPERIAL
          </Text>
        </Pressable>
      </View>

      <View style={styles.fieldGap}>
        <ConversationAnswerCard
          title="HEIGHT"
          placeholderText={isImperial ? "5'11" : "180"}
          unit={isImperial ? "ft / in" : "cm"}
          value={height}
          onChangeText={setHeight}
          keyboardType="decimal-pad"
        />
      </View>

      <ConversationAnswerCard
        title="WEIGHT"
        placeholderText={isImperial ? "176" : "80"}
        unit={isImperial ? "lbs" : "kg"}
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
      />
    </View>
  );

  const handleComplete = (formattedAnswer: string) => {
    if (height && weight) {
      onNext(height, weight, units);
      return;
    }

    const parsed = parseFormattedBiometrics(formattedAnswer);
    onNext(parsed.height ?? "5'11", parsed.weight ?? "176", parsed.units ?? units);
  };

  return (
    <ConversationalScreen
      coachMessage={BIOMETRICS_PROMPT}
      typeSlot={typeSlot}
      typeValid={typeValid}
      dotIndex={7}
      showBack
      onBack={onBack}
      onComplete={handleComplete}
      formatAnswer={formatBiometricsAnswer}
      forceTypeMode={forceTypeMode}
    />
  );
};

const styles = StyleSheet.create({
  unitToggle: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 3,
    gap: 2,
    marginBottom: 10,
  },

  unitBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },

  unitBtnActive: {
    backgroundColor: "rgba(200,241,53,0.1)",
  },

  unitBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: "rgba(255,255,255,0.28)",
    textTransform: "uppercase",
  },

  unitBtnTextActive: {
    color: "#C8F135",
  },

  fieldGap: {
    marginBottom: 10,
  },
});
