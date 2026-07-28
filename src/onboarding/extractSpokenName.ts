const capitalize = (text: string): string =>
  text
    .split(/\s+/)
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");

/**
 * Pulls just the name out of a conversational answer to "what's your name?" — STT often
 * returns a full sentence ("Hey, I'm Harris") rather than a bare name, so this strips
 * greetings and self-introduction phrasing before falling back to the first couple words.
 */
export const extractSpokenName = (rawTranscript: string): string => {
  let text = rawTranscript.trim();

  text = text.replace(/^(?:hey|hi|hello|yo)[,.!]?\s*/i, "");

  const introMatch = text.match(
    /(?:my name is|i am|i'm|im|it is|it's|its|this is|call me)\s+([a-z][a-z'-]*(?:\s+[a-z][a-z'-]*)?)/i,
  );

  if (introMatch) {
    return capitalize(introMatch[1].trim());
  }

  const words = text
    .replace(/[.,!?]+$/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return capitalize(words.slice(0, 2).join(" "));
};
