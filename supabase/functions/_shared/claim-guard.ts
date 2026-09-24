export interface ClaimGuardState {
  liveSession: boolean;
  setLoggedThisTurn: boolean;
  restActive: boolean;
  actionSucceededThisTurn: boolean;
}

const SET_CLAIMS: RegExp[] = [
  /\b(?:solid|nice|great|good|strong|clean|big|huge|awesome|perfect|brilliant)\s+(?:work\s+on\s+)?(?:(?:first|second|third|fourth|fifth|sixth|last|final|opening)\s+)?set\b/i,
  /\b(?:set|that|it)(?:'s|\s+is|\s+was|\s+has\s+been)\s+(?:now\s+)?(?:logged|recorded|in\s+the\s+books|counted|saved)\b/i,
  /\b(?:logged|recorded)\s+(?:it|that|the\s+set|your\s+set|set\s+\w+)\b/i,
  /\bi(?:'ve|\s+have)?\s+(?:just\s+)?(?:logged|recorded)\b/i,
  /\bthe\s+app\s+(?:should|will|is\s+going\s+to|'ll)\s+(?:log|record|pick)\b/i,
  /\byou\s+(?:completed|finished)\s+(?:\w+\s+){0,2}(?:reps?|sets?)\b/i,
  /\bset\s+(?:one|two|three|four|five|six|\d+)(?:'s|\s+is)?\s+(?:done|down|complete|finished|in\s+the\s+books)\b/i,
  /\bthat'?s\s+(?:set\s+\w+|(?:\w+\s+)?reps?)\s+(?:done|down|in)\b/i,
];

const REST_CLAIMS: RegExp[] = [
  /\brest(?:'s|\s+is|\s+has)?\s+(?:now\s+)?(?:starting|started|running|begun|underway|on)\b/i,
  /\brest\s+starts?\b/i,
  /\b(?:start|starting|begin|beginning)\s+(?:your|the)\s+rest\b/i,
  /\b(?:your|the)\s+rest\s+timer\s+(?:is|has)\b/i,
  /\btime\s+to\s+rest\b/i,
];

const ACTION_CLAIMS: RegExp[] = [
  /\b(?:is|was|has\s+been|have\s+been|got|been)\s+(?:now\s+)?(?:cleared|deleted|discarded|dropped|removed|wiped|swapped|switched|cancel+ed)\b/i,
  /\bi(?:'ve|\s+have)\s+(?:just\s+|now\s+)?(?:cleared|deleted|discarded|dropped|removed|wiped|swapped|switched|saved|cancel+ed|updated|changed|moved|added|created|reset)\b/i,
];

const matchesAny = (patterns: RegExp[], text: string): boolean => patterns.some((p) => p.test(text));

export function isUnbackedClaim(clause: string, state: ClaimGuardState): boolean {
  const text = clause.replace(/[\u2018\u2019\u201B\u02BC]/g, "'").trim();
  if (!text) return false;
  if (state.liveSession && !state.setLoggedThisTurn) {
    if (matchesAny(SET_CLAIMS, text)) return true;
    if (!state.restActive && matchesAny(REST_CLAIMS, text)) return true;
  }
  if (!state.actionSucceededThisTurn && matchesAny(ACTION_CLAIMS, text)) return true;
  return false;
}

export function guardClaims(text: string, state: ClaimGuardState): { text: string; dropped: string[] } {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const sentence of sentences) {
    if (isUnbackedClaim(sentence, state)) dropped.push(sentence);
    else kept.push(sentence);
  }
  return { text: kept.join(' ').trim(), dropped };
}

const FAILED_STATUS =
  /^(?:not_|no_|invalid|unsafe|ambiguous|preview|already|replacement_|likely_correction|unavailable|error|failed|needs_)/;

export function isSuccessfulToolResult(result: unknown): boolean {
  if (result == null) return false;
  const status = (result as { status?: unknown }).status;
  if (typeof status !== 'string') return true;
  return !FAILED_STATUS.test(status);
}

const READ_ONLY_TOOLS = new Set([
  'read_state',
  'estimate_body_fat_goal',
  'open_screen',
  'show_plan_breakdown',
  'show_daily_workout',
  'show_nutrition_summary',
  'show_progress_report',
  'show_readiness',
  'show_top_lifts',
  'show_previous_workout',
]);

export interface ToolOutcomes {
  setLogged: boolean;
  actionSucceeded: boolean;
}

type Handler = (input: any) => Promise<any>;

export function trackToolOutcomes<T extends Record<string, Handler>>(handlers: T): { handlers: T; outcomes: ToolOutcomes } {
  const outcomes: ToolOutcomes = { setLogged: false, actionSucceeded: false };
  const wrapped = Object.fromEntries(
    Object.entries(handlers).map(([name, run]) => [
      name,
      async (input: any) => {
        const result = await run(input);
        if (name === 'log_live_set' && result?.status === 'logged') outcomes.setLogged = true;
        if (!READ_ONLY_TOOLS.has(name) && isSuccessfulToolResult(result)) outcomes.actionSucceeded = true;
        return result;
      },
    ]),
  ) as T;
  return { handlers: wrapped, outcomes };
}

export function withGuardedFinalText(blocks: any[], reply: string): any[] {
  let last = -1;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i]?.role === 'assistant') {
      last = i;
      break;
    }
  }
  if (last === -1 || !Array.isArray(blocks[last].content)) return blocks;
  const content = blocks[last].content as any[];
  const nonText = content.filter((block) => block?.type !== 'text');
  const next = reply.trim() ? [...nonText, { type: 'text', text: reply }] : nonText;
  const out = blocks.slice();
  out[last] = { ...blocks[last], content: next.length > 0 ? next : [{ type: 'text', text: ' ' }] };
  return out;
}

export function claimFallback(liveSession: boolean, userReportedSet: boolean): string {
  if (userReportedSet) return SET_DETAILS_FALLBACK;
  return liveSession ? LIVE_SESSION_FALLBACK : ACTION_FALLBACK;
}

export const SET_DETAILS_FALLBACK = 'How many reps did you get on that set?';
export const LIVE_SESSION_FALLBACK = "Tell me when the set's done and how many reps you got.";
export const ACTION_FALLBACK = "I haven't changed anything yet. Want me to go ahead?";
