import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  TextInputProps,
} from "react-native";

import { colors, fonts } from "../constants/theme";

interface ConversationAnswerCardProps extends TextInputProps {
  title?: string;
  placeholderText?: string;
  unit?: string;
  value: string;
  onChangeText: (text: string) => void;
}

export const ConversationAnswerCard = ({
  title = "YOUR ANSWER",
  placeholderText = "YOUR NAME",
  unit,
  value,
  onChangeText,
  ...props
}: ConversationAnswerCardProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.container, isFocused && styles.containerFocused]}>
      <Text style={styles.label}>{title}</Text>

      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholderText}
          placeholderTextColor="rgba(255,255,255,0.12)"
          selectionColor={colors.accent}
          autoCapitalize="words"
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={[styles.input, unit ? styles.inputWithUnit : undefined]}
          {...props}
        />

        {unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,

    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",

    backgroundColor: "rgba(255,255,255,0.02)",

    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
  },

  containerFocused: {
    borderColor: "rgba(200,241,53,0.2)",
    backgroundColor: "rgba(200,241,53,0.025)",
  },

  label: {
    fontFamily: fonts.mono,
    fontSize: 9,
    letterSpacing: 1,

    color: "rgba(255,255,255,0.28)",

    marginBottom: 4,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },

  input: {
    padding: 0,

    fontFamily: fonts.display,
    fontSize: 38,
    lineHeight: 46,

    color: colors.text,

    textTransform: "uppercase",
  },

  inputWithUnit: {
    flexShrink: 1,
  },

  unit: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: "rgba(255,255,255,0.3)",
    marginBottom: 4,
  },
});
