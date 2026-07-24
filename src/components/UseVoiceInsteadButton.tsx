import React from "react";
import { fonts } from "../constants/theme";
import { Pressable, StyleSheet, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  onPress: () => void;
}

export const UseVoiceInsteadButton = ({ onPress }: Props) => {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <MaterialCommunityIcons
        name="microphone-outline"
        size={16}
        color="rgba(255,255,255,0.6)"
      />

      <Text style={styles.title}>Use voice instead</Text>
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

  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
    color: "rgba(255,255,255,0.6)",
  },
});
