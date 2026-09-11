// The coaching brain's tool-use loop. Pure orchestration, no I/O: the model call and every
// tool's execution are injected, so this same loop runs in the edge function (real Anthropic
// API + real Supabase handlers) and in tests (scripted fakes). See docs/coaching-brain.md.
//
// The safety invariant lives in the injected handlers, not here: a handler for a plan-mutating
// tool (generate_training_plan / update_training_plan) must throw before writing anything if
// injury-validator rejects the plan. This loop just feeds that rejection back to the model as
// a tool error and lets it revise — it never persists on the model's behalf.

export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: any;
}

export interface ModelTurn {
  stop_reason: 'tool_use' | 'end_turn' | string;
  content: ContentBlock[];
}

// The static instructions (rules, tool guidance) barely change turn to turn, but the dynamic
// half (today's date, live session state) changes on every single turn — concatenating them into
// one string before it reaches the model defeats Anthropic's prompt caching, since caching only
// hits on a byte-identical prefix. Passing them separately lets createCallModel cache just the
// static half. A plain string is still accepted for callers (like the text-chat brain) that
// haven't split their prompt yet — it's simply sent uncached.
export type SystemPromptInput = string | { static: string; dynamic: string };

export type CallModel = (
  messages: any[],
  system: SystemPromptInput,
  onTextDelta?: (delta: string) => void,
) => Promise<ModelTurn>;

export type ToolHandlers = Record<string, (input: any) => Promise<any>>;

export interface ToolCallRecord {
  name: string;
  input: any;
  result?: any;
  error?: string;
}

export interface BrainTurnResult {
  reply: string;
  toolCalls: ToolCallRecord[];
  messages: any[];
}

const MAX_TOOL_ROUNDS = 6;
const STUCK_REPLY = "I'm having trouble finishing that — let's try again in a moment.";

export async function runBrainTurn(opts: {
  systemPrompt: SystemPromptInput;
  messages: any[];
  handlers: ToolHandlers;
  callModel: CallModel;
  onTextDelta?: (delta: string) => void;
}): Promise<BrainTurnResult> {
  const { systemPrompt, handlers, callModel, onTextDelta } = opts;
  let messages = [...opts.messages];
  const toolCalls: ToolCallRecord[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const turn = await callModel(messages, systemPrompt, onTextDelta);
    messages = [...messages, { role: 'assistant', content: turn.content }];

    if (turn.stop_reason !== 'tool_use') {
      const reply = turn.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      return { reply, toolCalls, messages };
    }

    const toolResults: any[] = [];
    for (const block of turn.content) {
      if (block.type !== 'tool_use') continue;
      const handler = handlers[block.name!];

      if (!handler) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Unknown tool "${block.name}".`,
          is_error: true,
        });
        toolCalls.push({ name: block.name!, input: block.input, error: 'unknown tool' });
        continue;
      }

      try {
        // TEMPORARY — voice-timing instrumentation. Remove once the slow phase is identified.
        const tTool0 = Date.now();
        const result = await handler(block.input);
        console.log(`[voice-timing:server] tool ${block.name}: +${Date.now() - tTool0}ms`);
        toolCalls.push({ name: block.name!, input: block.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolCalls.push({ name: block.name!, input: block.input, error: message });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: message,
          is_error: true,
        });
      }
    }

    messages = [...messages, { role: 'user', content: toolResults }];
  }

  return { reply: STUCK_REPLY, toolCalls, messages };
}
