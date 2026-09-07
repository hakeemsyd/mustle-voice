import { Text, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";

interface CoachMessageTextProps {
  text: string;
  style: StyleProp<TextStyle>;
  variant?: "dark" | "light" | "plain";
}

// Parses **bold** markdown into a highlighted inline tag — the coach uses this to call out
// a single keyword (e.g. a session name) inline rather than a plain description in prose.
//
// The "plain" variant is weight-only, no highlight: the session-chat surfaces (Preview/Active
// Session) use bold on several terms per message (session name, first exercise, the affordances
// it points at), and the highlight treatment reads as a wall of lime chips there rather than the
// single-keyword callout it was built for. Matches the reference's own `.threadTextBold`, which
// is `font-weight: 800` and nothing else.
export function CoachMessageText({ text, style, variant = "dark" }: CoachMessageTextProps) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const match = part.match(/^\*\*(.+)\*\*$/);
        if (!match) return part;
        return (
          <Text
            key={i}
            style={
              variant === "light" ? styles.boldLight : variant === "plain" ? styles.boldPlain : styles.bold
            }
          >
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
  boldLight: {
    fontFamily: fonts.bodySemiBold,
    color: lightCard.text,
    backgroundColor: lightCard.pillBg,
  },
  boldPlain: {
    fontFamily: fonts.bodyExtraBold,
  },
} as const;
