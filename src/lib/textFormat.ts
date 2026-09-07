/** Humanizes a raw snake_case/lowercase label ("upper_pull") into a display title ("Upper Pull").
 *  Consolidated here after several call sites independently duplicated the same one-liner and a
 *  few of them drifted — never got the humanizer applied at all (raw `UPPER_PULL` visible
 *  on-screen). One shared function removes that drift vector. */
export function titleCase(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
