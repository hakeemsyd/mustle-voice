import React from "react";
import { colors, fonts } from "../constants/theme";
import { Pressable, StyleSheet, Text } from "react-native";

interface Props {
  title?: string;
  disabled?: boolean;
  onPress: () => void;
}

export const ConversationContinueButton = ({
  title = "CONTINUE",
  disabled,
  onPress,
}: Props) => {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.container, disabled && styles.disabled]}
    >
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.accent,

    alignItems: "center",
    justifyContent: "center",
  },

  disabled: {
    opacity: 0.28,
  },

  title: {
    fontFamily: fonts.display,
    fontSize: 18,
    letterSpacing: 0.7,
    color: colors.accentOn,
  },
});
