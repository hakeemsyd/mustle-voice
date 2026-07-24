import React from "react";
import { fonts } from "../constants/theme";
import { Pressable, StyleSheet, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface TypeInsteadButtonProps {
  disabled?: boolean;
  onPress?: () => void;
}

export const TypeInsteadButton = ({ disabled, onPress }: TypeInsteadButtonProps) => {
  return (
    <Pressable
      style={[styles.container, disabled && styles.containerDisabled]}
      disabled={disabled}
      onPress={onPress}
    >
      <MaterialCommunityIcons
        name="keyboard-outline"
        size={16}
        color="rgba(255,255,255,0.6)"
      />

      <Text style={styles.title}>Type instead</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",

    backgroundColor: "rgba(255,255,255,0.04)",

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 7,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },

  containerDisabled: {
    opacity: 0.35,
  },

  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
});
