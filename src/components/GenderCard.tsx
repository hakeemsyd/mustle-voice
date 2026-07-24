import React from "react";
import { TouchableOpacity, View, Text, StyleSheet } from "react-native";

import { CheckIcon } from "../icons/CheckIcon";
import { fonts } from "../constants/theme";

interface Props {
  label: string;
  subLabel: string;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}

export const GenderCard = ({
  label,
  subLabel,
  icon,
  selected,
  onPress,
}: Props) => {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[styles.card, selected && styles.selectedCard]}
    >
      <View
        style={[styles.iconContainer, selected && styles.selectedIconContainer]}
      >
        {icon}
      </View>

      <View style={styles.textContainer}>
        <Text style={[styles.label, selected && styles.selectedLabel]}>
          {label}
        </Text>

        <Text style={[styles.subLabel, selected && styles.selectedSubLabel]}>
          {subLabel}
        </Text>
      </View>

      <View style={styles.checkContainer}>{selected && <CheckIcon />}</View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderRadius: 14,
    backgroundColor: "#111111",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    marginBottom: 10,
  },

  selectedCard: {
    borderColor: "rgba(200,241,53,0.45)",
    backgroundColor: "rgba(200,241,53,0.04)",
  },

  iconContainer: {
    width: 48,
    height: 48,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "rgba(255,255,255,0.06)",
  },

  selectedIconContainer: {
    backgroundColor: "rgba(200,241,53,0.10)",
  },

  textContainer: {
    flex: 1,
    marginLeft: 20,
  },

  label: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: "700",
    fontFamily: fonts.display,
    color: "rgba(255,255,255,0.78)",
  },

  selectedLabel: {
    color: "#FFFFFF",
  },

  subLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.body,
    color: "rgba(255,255,255,0.35)",
  },

  selectedSubLabel: {
    color: "rgba(200,241,53,0.55)",
  },

  checkContainer: {
    width: 20,
    height: 20,

    alignItems: "center",
    justifyContent: "center",
  },
});
