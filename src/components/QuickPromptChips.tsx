import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { colors, fonts } from "../constants/theme";

export interface QuickPromptOption {
  label: string;
  phrase: string;
}

// Same seven prompts the design's own dev-only trigger row demonstrated (one per structured
// response type, plus a plain-chat option) — sent through the exact same chat pipeline typing
// them would use, not a shortcut around it.
export const QUICK_PROMPT_OPTIONS: QuickPromptOption[] = [
  { label: "Monthly plan", phrase: "Give me a breakdown of my monthly plan" },
  { label: "Today's workout", phrase: "What's today's workout?" },
  { label: "Nutrition summary", phrase: "Give me my nutrition summary" },
  { label: "Progress report", phrase: "Show me my progress report" },
  { label: "Readiness", phrase: "How's my readiness today?" },
  { label: "Top lifts", phrase: "Show me my top lifts" },
  { label: "Just chat", phrase: "How's it going?" },
];

export const GLOBAL_CHAT_PROMPT_OPTIONS: QuickPromptOption[] = [
  { label: "Next workout", phrase: "What's today's workout?" },
  { label: "Week's plan", phrase: "Give me a breakdown of my plan for this week" },
  { label: "Today's nutrition", phrase: "Give me my nutrition summary for today" },
  { label: "Previous workout", phrase: "What was my previous workout?" },
];

interface QuickPromptChipsProps {
  onPick: (phrase: string) => void;
  disabled?: boolean;
  options?: QuickPromptOption[];
}

export function QuickPromptChips({ onPick, disabled, options = QUICK_PROMPT_OPTIONS }: QuickPromptChipsProps) {
  return (
    <ScrollView
      horizontal
      style={styles.scroll}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((opt) => (
        <Pressable
          key={opt.label}
          style={styles.chip}
          onPress={() => onPick(opt.phrase)}
          disabled={disabled}
        >
          <Text style={styles.chipText}>{opt.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.muted,
  },
});
