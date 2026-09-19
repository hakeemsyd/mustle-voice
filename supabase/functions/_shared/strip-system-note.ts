const SYSTEM_NOTE = /\[system note\b[^\]]*\]/gi;
const UNCLOSED_SYSTEM_NOTE = /\[system note\b[^\]]*$/i;
const OPENING = '[system note';

export const stripSystemNote = (text: string): string =>
  text
    .replace(SYSTEM_NOTE, '')
    .replace(UNCLOSED_SYSTEM_NOTE, '')
    .replace(/\s+/g, ' ')
    .trim();

export const createSystemNoteFilter = (): ((chunk: string) => string) => {
  let inNote = false;
  let pending = '';

  return (chunk: string): string => {
    let text = pending + chunk;
    pending = '';
    let out = '';

    while (text.length > 0) {
      if (inNote) {
        const close = text.indexOf(']');
        if (close === -1) return out;
        text = text.slice(close + 1);
        inNote = false;
        continue;
      }

      const open = text.toLowerCase().indexOf(OPENING);
      if (open !== -1) {
        out += text.slice(0, open);
        text = text.slice(open + OPENING.length);
        inNote = true;
        continue;
      }

      const bracket = text.lastIndexOf('[');
      if (bracket !== -1 && OPENING.startsWith(text.slice(bracket).toLowerCase())) {
        out += text.slice(0, bracket);
        pending = text.slice(bracket);
        return out;
      }

      out += text;
      text = '';
    }

    return out;
  };
};
