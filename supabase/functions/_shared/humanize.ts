/**
 * Turns a stored session focus ("upper_push") into something speakable ("Upper Push").
 *
 * Applied wherever a focus value is handed to the model — tool results and context blocks alike,
 * not just the strings we format for display. The model repeats what it is given verbatim, so a
 * raw label anywhere in its input surfaces as a raw label in the user's ear and on Home ("Time to
 * hit upper_push"). Mirrors src/lib/textFormat.ts's titleCase on the client.
 */
export function humanizeFocus(focus: string | null | undefined): string {
  if (!focus) return 'Training';
  return focus
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

const LEADING_CONCESSION =
  /^(?:you(?:'|’)?re|you are)\s+(?:absolutely\s+|completely\s+|totally\s+|quite\s+)?right\s*[,.!—–-]\s*(?=\S)/i;
const SUBSTANTIVE_CONCESSION =
  /^(?:you(?:'|’)?re|you are)\s+(?:absolutely\s+|completely\s+|totally\s+|quite\s+)?right\s+(?:that|about)\b/i;

export function dropLeadingConcession(text: string): string {
  if (SUBSTANTIVE_CONCESSION.test(text)) return text;
  const trimmed = text.replace(LEADING_CONCESSION, '');
  if (trimmed === text) return text;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// A reply that argues with itself mid-sentence ("your first session is Upper Push on Monday — oh
// wait, that won't work today") shows the user reasoning that should never have left the model.
// The correction itself is usually right, so the abandoned first half and the hinge are dropped.
//
// Deliberately narrow, because a looser version of this shipped and mangled ordinary replies:
// "actually" and "wait" are far more often plain words than correction hinges ("I need to actually
// know a few things" became "Know a few things", "we should wait until Monday" became "Until
// Monday"). So those two only count when a dash sets them off as an aside, while the phrases that
// can only ever be self-correction are allowed a comma too. A missed "oh wait" is a blemish; a
// truncated sentence changes what the coach said.
const DASH_HINGE = /\s*[—–]\s*\b(?:oh\s+wait|wait|actually|hold\s+on|scratch\s+that|my\s+mistake|no,?\s*sorry|sorry,?\s*i\s+mean)\b[\s,]*/i;
const PHRASE_HINGE = /\s*,\s*\b(?:oh\s+wait|hold\s+on|scratch\s+that|my\s+mistake|no,?\s*sorry|sorry,?\s*i\s+mean)\b[\s,]*/i;

const firstHinge = (sentence: string): RegExpMatchArray | null => {
  const dash = sentence.match(DASH_HINGE);
  const phrase = sentence.match(PHRASE_HINGE);
  if (!dash) return phrase;
  if (!phrase) return dash;
  return (dash.index ?? 0) <= (phrase.index ?? 0) ? dash : phrase;
};

export function dropSelfCorrection(text: string): string {
  if (!text?.trim()) return text;
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      // Loops so a chain of corrections ("hold on, scratch that, it should be...") collapses to
      // what was finally settled on rather than leaving the later hinges in place.
      let current = sentence;
      for (let i = 0; i < 4; i++) {
        const hinge = firstHinge(current);
        if (!hinge || hinge.index === undefined || hinge.index === 0) break;
        const after = current.slice(hinge.index + hinge[0].length).trim();
        // Only rewrite when what follows stands as a clause of its own — otherwise the hinge was
        // trailing commentary and the sentence must survive intact.
        if (after.split(/\s+/).length < 4) break;
        current = after.charAt(0).toUpperCase() + after.slice(1);
      }
      return current;
    })
    .join(' ');
}
