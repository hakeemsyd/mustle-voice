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
