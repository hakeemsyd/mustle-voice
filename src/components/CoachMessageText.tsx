import { Text, type TextStyle } from "react-native";
import { colors, fonts } from "../constants/theme";

interface CoachMessageTextProps {
  text: string;
  style: TextStyle;
}

// Parses **bold** markdown into a highlighted inline tag — the coach uses this to call out
// a single keyword (e.g. a session name) inline rather than a plain description in prose.
export function CoachMessageText({ text, style }: CoachMessageTextProps) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const match = part.match(/^\*\*(.+)\*\*$/);
        if (!match) return part;
        return (
          <Text key={i} style={styles.bold}>
            {match[1]}
          </Text>
        );
      })}
    </Text>
  );
}

// RN's inline (nested) Text only reliably supports color/font/backgroundColor on iOS — border
// properties don't apply to a text run, so the highlight is bg+bold only, not a bordered pill.
const styles = {
  bold: {
    fontFamily: fonts.bodySemiBold,
    color: colors.text,
    backgroundColor: "rgba(200,241,53,0.3)",
  },
} as const;
