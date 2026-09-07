import type { AgentResult } from '../../src/agent-result.js';

type Tool = { name: string; input_schema?: Record<string, unknown> };
type Block =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };

const result: AgentResult = {
  summary: 'Fixed fixture.txt using the native Bash tool.',
  probableCause: 'The fixture contained an incorrect value.',
  confidence: 'high',
  fixAttempted: true,
  fixComplete: true,
  prTitle: 'Fix runner sandbox fixture',
  prBody: 'Updates fixture.txt to the expected value and checks its exact contents.',
  validation:
    'Native Bash wrote fixture.txt and Node asserted its contents equal fixed followed by a newline.',
  previewAttempted: false,
  previewReady: false,
  previewValidation: 'This text fixture does not have a browser preview.',
};

/** Deterministic, offline API implementation for exercising the real Claude CLI. */
export function createFixtureApi(): typeof fetch {
  let messages = 0;
  let usedBash = false;
  let usedStructuredOutput = false;

  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== 'https://api.anthropic.com' || init?.method !== 'POST') {
      throw new Error('Fixture only accepts POST requests to the fixed Anthropic upstream.');
    }
    if (url.pathname === '/v1/messages/count_tokens') {
      return Response.json({ input_tokens: 100 });
    }
    if (url.pathname !== '/v1/messages') throw new Error('Unsupported fixture API route.');
    if (++messages > 32) throw new Error('Fixture API exceeded its response cycle limit.');
    if (typeof init.body !== 'string') throw new Error('Fixture expects a JSON request body.');
    const body = JSON.parse(init.body) as {
      model: string;
      stream?: boolean;
      tools?: Tool[];
      output_config?: { format?: unknown };
      output_format?: unknown;
    };
    const tools = Array.isArray(body.tools) ? body.tools : [];
    const bash = tools.find((tool) => tool.name === 'Bash');
    const structured = tools.find(
      (tool) => tool.name.replace(/[^a-z]/giu, '').toLowerCase() === 'structuredoutput',
    );
    let block: Block;
    if (bash && !usedBash) {
      usedBash = true;
      block = {
        type: 'tool_use',
        id: `toolu_fixture_bash_${messages}`,
        name: bash.name,
        input: {
          command: `printf 'fixed\\n' > fixture.txt && node -e 'require("node:assert/strict").equal(require("node:fs").readFileSync("fixture.txt", "utf8"), "fixed\\n")'`,
          description: 'Fix fixture.txt and validate its exact contents',
          timeout: 10000,
        },
      };
    } else if (structured && usedBash && !usedStructuredOutput) {
      usedStructuredOutput = true;
      block = {
        type: 'tool_use',
        id: `toolu_fixture_result_${messages}`,
        name: structured.name,
        input: { ...result },
      };
    } else {
      // Helper calls may precede the main request and offer no native tools.
      // Also support CLI versions that implement --json-schema using API output format.
      block = {
        type: 'text',
        text:
          usedBash && (body.output_config?.format || body.output_format)
            ? JSON.stringify(result)
            : 'Done.',
      };
    }

    const stopReason = block.type === 'tool_use' ? 'tool_use' : 'end_turn';
    const message = {
      id: `msg_fixture_${messages}`,
      type: 'message',
      role: 'assistant',
      model: body.model,
      content: [block],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: 100,
        output_tokens: 30,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    };
    if (!body.stream) return Response.json(message);

    const events: Record<string, unknown>[] = [
      {
        type: 'message_start',
        message: {
          ...message,
          content: [],
          stop_reason: null,
          usage: { ...message.usage, output_tokens: 0 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block:
          block.type === 'tool_use' ? { ...block, input: {} } : { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta:
          block.type === 'tool_use'
            ? { type: 'input_json_delta', partial_json: JSON.stringify(block.input) }
            : { type: 'text_delta', text: block.text },
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 30 },
      },
      { type: 'message_stop' },
    ];
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const event of events) {
            controller.enqueue(
              encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
            );
          }
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream', 'request-id': `req_fixture_${messages}` } },
    );
  };
}
