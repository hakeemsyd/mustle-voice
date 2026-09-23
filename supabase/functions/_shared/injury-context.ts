export interface ActiveInjuryRow {
  area: string;
  pain_level: number | null;
  severity: string | null;
  created_at: string;
}

const HIGH_PAIN_THRESHOLD = 6;

export function describeActiveInjuries(
  activeInjuries: ActiveInjuryRow[] | null,
  fetchFailed: boolean,
): string | null {
  if (fetchFailed) {
    return (
      'Injury history failed to load this turn. This is NOT the same as having no injuries on ' +
      'file — treat it as unknown, not clear. Do not recommend exercise, do not clear any movement ' +
      'as safe, and do not imply anything is fine to train until you can confirm there is no active ' +
      'injury: ask the user directly whether they have any current pain or injury before giving ' +
      'exercise guidance this turn.'
    );
  }
  if (!activeInjuries || activeInjuries.length === 0) return null;

  // One area, one entry — the most recent. Each update is logged as a new row rather than an edit,
  // so an area the user has reported twice arrived here as several entries at different pain
  // levels. Confirmed live: after "it's down to 3 out of 10" the coach still read back "still at
  // that 8 out of 10", because the superseded row was sitting in this list next to the current one.
  const latestByArea = new Map<string, ActiveInjuryRow>();
  for (const injury of [...activeInjuries].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )) {
    latestByArea.set(injury.area.toLowerCase(), injury);
  }
  const current = [...latestByArea.values()];

  return [
    'Active injuries on file — check this before ANY exercise or stretch guidance for the ' +
      'affected area, every time, even mid-conversation on a topic already covered:',
    ...current.map((inj) => {
      const painPart =
        inj.pain_level != null
          ? `pain reported ${inj.pain_level}/10`
          : inj.severity
            ? `severity noted as "${inj.severity}"`
            : 'no pain level on file';
      const directive =
        inj.pain_level != null && inj.pain_level >= HIGH_PAIN_THRESHOLD
          ? 'Do not recommend exercise for this area and do not imply that any stretch clears ' +
            'them to train. Ask whether the pain has changed since this was logged; if it is ' +
            'still elevated or worsening, tell them plainly to get it assessed by a qualified ' +
            'clinician instead of coaching around it.'
          : 'Ask how it feels today before giving any guidance. If you do suggest a stretch or ' +
            'exercise, every one must carry all three: how to perform it, an explicit hold time or ' +
            'rep count (e.g. "30 seconds each side", "8 slow reps"), and an explicit stop rule ' +
            'naming the sensation that means stop now. A list of movement names without those is ' +
            'not acceptable. Never say that a few reps or stretches means they are "good to go" ' +
            'or cleared to train.';
      return `  - ${inj.area}: ${painPart}, logged ${new Date(inj.created_at).toISOString().slice(0, 10)}. ${directive}`;
    }),
  ].join('\n');
}

// Pain mentioned in the CURRENT message, which is a different problem from the injuries above:
// those are already on file, this one is not yet. Confirmed live that timing is unreliable — an
// 8/10 SI-joint report was logged immediately in one run and only three turns later in another,
// so a user who closed the app in between would have lost it entirely. This makes the turn that
// hears it the turn that records it.
const PAIN_MENTION =
  /\b(?:pain|painful|hurts?|hurting|sore|soreness|ache|aching|aches|injur(?:y|ed|ies)|tweak(?:ed)?|strain(?:ed)?|sprain(?:ed)?|pulled|flare[\s-]?up|stiff(?:ness)?)\b/i;
// A severity rating on its own carries no pain word — "it's down to about 3 out of 10 now" left an
// 8/10 record standing, so every later turn kept gating on a number the user had already moved on
// from. An update matters as much as the first report.
const PAIN_RATING = /\b(?:10|[0-9])\s*(?:\/|out\s+of)\s*10\b/i;
const PAIN_NEGATED =
  /\b(?:no|none|not|without|never|free\s+of|nothing)\b[^.!?]{0,30}\b(?:pain|injur|hurt|sore|ache)/i;

export function describeUnloggedPainReport(currentUserText: string | null | undefined): string | null {
  const text = (currentUserText ?? '').trim();
  if (!text || (!PAIN_MENTION.test(text) && !PAIN_RATING.test(text)) || PAIN_NEGATED.test(text)) return null;

  return (
    'The user just mentioned pain, an injury, or a pain rating in this message. Before any training ' +
    'guidance, call record_injury for it this turn — include the pain level if they gave one or it ' +
    'can reasonably be inferred — even if you are still asking clarifying questions, and even if you ' +
    'intend to log it later. If this is a CHANGE to something already on file (better, worse, or a ' +
    'new number), call record_injury again with the new level so the record stops reporting a figure ' +
    'they have moved past. Only skip the call when it is already on file above at the same level.'
  );
}
