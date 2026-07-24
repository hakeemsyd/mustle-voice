import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { ProgressDots } from "../ProgressDots";
import { GenderCard } from "../../components/GenderCard";

import { FemaleIcon, MaleIcon, PreferNotToSayIcon } from "../../icons";

import { colors, fonts } from "../../constants/theme";
import { BackIcon } from "../../icons/BackIcon";

type Gender = "male" | "female" | "prefer_not_to_say";

interface Props {
  onNext: (gender: Gender) => void;
  onBack: () => void;
}

const OPTIONS = [
  {
    id: "male",
    label: "MALE",
    subLabel: "Man",
    getIcon: (selected: boolean) => (
      <MaleIcon
        size={28}
        color={selected ? colors.accent : "rgba(255,255,255,0.65)"}
      />
    ),
  },
  {
    id: "female",
    label: "FEMALE",
    subLabel: "Woman",
    getIcon: (selected: boolean) => (
      <FemaleIcon
        size={28}
        color={selected ? colors.accent : "rgba(255,255,255,0.65)"}
      />
    ),
  },
  {
    id: "prefer_not_to_say",
    label: "PREFER NOT TO SAY",
    subLabel: "Skip this",
    getIcon: (selected: boolean) => (
      <PreferNotToSayIcon
        size={28}
        color={selected ? colors.accent : "rgba(255,255,255,0.65)"}
      />
    ),
  },
];

export const ScreenGender = ({ onNext, onBack }: Props) => {
  const [selected, setSelected] = useState<Gender | null>(null);

  const handleSelect = (gender: Gender) => {
    setSelected(gender);

    setTimeout(() => {
      onNext(gender);
    }, 200);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity activeOpacity={0.7} onPress={onBack}>
          <BackIcon />
        </TouchableOpacity>

        <ProgressDots total={11} current={2} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>ABOUT YOU</Text>

        <Text style={styles.title}>How do you{"\n"}identify?</Text>

        <View style={styles.cardsContainer}>
          {OPTIONS.map((option) => {
            const isSelected = selected === option.id;

            return (
              <GenderCard
                key={option.id}
                label={option.label}
                subLabel={option.subLabel}
                icon={option.getIcon(isSelected)}
                selected={isSelected}
                onPress={() => handleSelect(option.id as Gender)}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    paddingTop: 60,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  backArrow: {
    color: "#FFFFFF",
    fontSize: 24,
    marginRight: 16,
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
  },

  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 13,
    letterSpacing: 1.2,
    color: "rgba(200,241,53,0.65)",
  },

  title: {
    marginTop: 20,
    fontFamily: fonts.display,
    fontSize: 42,
    lineHeight: 42,

    color: "#FFFFFF",
  },

  cardsContainer: {
    marginTop: 36,
  },
});
