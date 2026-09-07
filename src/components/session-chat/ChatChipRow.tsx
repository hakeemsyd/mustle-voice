import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../../constants/theme";

export interface ChatChip {
  label: string;
  primary?: boolean;
  disabled?: boolean;
}

interface ChatChipRowProps {
  chips: ChatChip[];
  onPick: (label: string) => void;
  disabled?: boolean;
}

// Wraps rather than scrolls horizontally: a chip set here is a complete set of choices (the
// exercises in today's session, the alternates for a swap), and a scroll rail hides most of them
// off the right edge with nothing to indicate there's more. Indented to clear the coach avatar
// so the chips read as belonging to the message that offered them.
export function ChatChipRow({ chips, onPick, disabled }: ChatChipRowProps) {
  if (chips.length === 0) return null;
  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <Pressable
          key={chip.label}
          style={({ pressed }) => [
            styles.chip,
            chip.primary && styles.chipPrimary,
            (disabled || chip.disabled) && styles.chipDisabled,
            pressed && styles.chipPressed,
          ]}
          onPress={() => onPick(chip.label)}
          disabled={disabled || chip.disabled}
        >
          <Text style={[styles.chipText, chip.primary && styles.chipTextPrimary]}>{chip.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    paddingLeft: 34,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceDeep,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  chipPrimary: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  chipPressed: {
    transform: [{ scale: 0.96 }],
    borderColor: colors.accentBorderStrong,
  },
  chipDisabled: {
    opacity: 0.35,
  },
  chipText: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 12,
    color: colors.text,
  },
  chipTextPrimary: {
    color: colors.accentOn,
  },
});
