import { Text, type StyleProp, type TextStyle } from "react-native";
import { colors, fonts, lightCard } from "../constants/theme";
import { canonicalizeExerciseNames } from "../lib/exerciseCatalog";

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
// RN's Text only breaks at whitespace, so a single unbroken run longer than the line — a URL, a
// long compound the model ran together, a stream of digits — has nowhere to wrap and simply runs
// off the right edge and gets clipped (confirmed live on a coach reply). There's no CSS
// `word-break: break-all` here, so the break opportunities have to be put into the string:
// U+200B is zero-width, invisible, and only takes effect if the line actually needs to break.
const SOFT_BREAK_AFTER = 18;

const withSoftBreaks = (text: string): string =>
  text.replace(new RegExp(`\\S{${SOFT_BREAK_AFTER + 1},}`, "g"), (run) =>
    run.replace(new RegExp(`(.{${SOFT_BREAK_AFTER}})`, "g"), "$1​"),
  );

export const CoachMessageText = ({ text, style, variant = "dark" }: CoachMessageTextProps) => {
  const parts = canonicalizeExerciseNames(text).split(/(\*\*.+?\*\*)/g);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const match = part.match(/^\*\*(.+)\*\*$/);
        if (!match) return withSoftBreaks(part);
        return (
          <Text
            key={i}
            style={
              variant === "light" ? styles.boldLight : variant === "plain" ? styles.boldPlain : styles.bold
            }
          >
            {withSoftBreaks(match[1])}
          </Text>
        );
      })}
    </Text>
  );
};

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
