/**
 * Compact per-turn index of a Claude Code execution file, modelled on the
 * `turn=N tool.execution_start` lines GitHub's cloud agent writes to its job log.
 *
 *   turn 3   mcp__sandbox__exec         pnpm test:node mergeSlotProps       → 1.2k chars
 *   turn 5   mcp__sandbox__write_file   packages/mui-material/src/...       → error
 */

export interface TimelineEntry {
  turn: number;
  tool: string;
  input: string;
  resultChars?: number;
  isError?: boolean;
}

const INPUT_PREVIEW_CHARS = 100;
const MAX_ENTRIES = 400;

// Tool arguments that best identify what a call did, checked in order.
const DESCRIPTIVE_INPUT_KEYS = ['command', 'skill', 'path', 'file_path', 'pattern', 'query', 'cwd'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function compact(value: string, maximumLength: number): string {
  const compacted = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return compacted.length <= maximumLength
    ? compacted
    : `${compacted.slice(0, maximumLength - 1)}…`;
}

function describeInput(input: unknown): string {
  if (!isRecord(input)) {
    return '';
  }
  for (const key of DESCRIPTIVE_INPUT_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return compact(value, INPUT_PREVIEW_CHARS);
    }
  }
  const firstString = Object.values(input).find(
    (value): value is string => typeof value === 'string' && value.trim() !== '',
  );
  return firstString === undefined ? '' : compact(firstString, INPUT_PREVIEW_CHARS);
}

function contentLength(content: unknown): number {
  if (typeof content === 'string') {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  return content.reduce<number>(
    (total, block) =>
      total + (isRecord(block) && typeof block.text === 'string' ? block.text.length : 0),
    0,
  );
}

function messageBlocks(message: unknown): Record<string, unknown>[] {
  if (!isRecord(message) || !isRecord(message.message) || !Array.isArray(message.message.content)) {
    return [];
  }
  return message.message.content.filter(isRecord);
}

/** Pair every tool_use with its tool_result and number them by assistant turn. */
export function extractTimeline(executionMessages: unknown): TimelineEntry[] {
  if (!Array.isArray(executionMessages)) {
    return [];
  }

  const entries: TimelineEntry[] = [];
  const entryByToolUseId = new Map<string, TimelineEntry>();
  let turn = 0;

  for (const message of executionMessages) {
    if (!isRecord(message)) {
      continue;
    }

    if (message.type === 'assistant') {
      turn += 1;
      for (const block of messageBlocks(message)) {
        if (block.type !== 'tool_use' || typeof block.name !== 'string') {
          continue;
        }
        const entry: TimelineEntry = { turn, tool: block.name, input: describeInput(block.input) };
        entries.push(entry);
        if (typeof block.id === 'string') {
          entryByToolUseId.set(block.id, entry);
        }
      }
      continue;
    }

    if (message.type !== 'user') {
      continue;
    }
    for (const block of messageBlocks(message)) {
      if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') {
        continue;
      }
      const entry = entryByToolUseId.get(block.tool_use_id);
      if (!entry) {
        continue;
      }
      entry.resultChars = contentLength(block.content);
      if (block.is_error === true) {
        entry.isError = true;
      }
    }
  }

  return entries;
}

function formatChars(chars: number): string {
  return chars >= 1_000 ? `${(chars / 1_000).toFixed(1)}k chars` : `${chars} chars`;
}

function formatEntry(entry: TimelineEntry, toolWidth: number): string {
  const outcome =
    entry.isError === true
      ? 'error'
      : entry.resultChars === undefined
        ? 'no result'
        : formatChars(entry.resultChars);
  return `turn ${String(entry.turn).padEnd(4)} ${entry.tool.padEnd(toolWidth)} ${entry.input}  → ${outcome}`;
}

/** Plain-text timeline for the Actions job log. */
export function formatTimeline(executionMessages: unknown): string {
  const entries = extractTimeline(executionMessages).slice(0, MAX_ENTRIES);
  if (entries.length === 0) {
    return 'Claude timeline: no tool calls were recorded.';
  }

  const toolWidth = Math.max(...entries.map((entry) => entry.tool.length));
  const errors = entries.filter((entry) => entry.isError === true).length;
  const header = `Claude timeline: ${entries.length} tool calls over ${entries.at(-1)?.turn} turns, ${errors} errored.`;
  return [header, ...entries.map((entry) => formatEntry(entry, toolWidth))].join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Collapsible Markdown section for the Actions step summary. */
export function formatTimelineSummary(executionMessages: unknown): string {
  return [
    '<details>',
    '<summary>Claude tool timeline</summary>',
    '',
    `<pre>${escapeHtml(formatTimeline(executionMessages))}</pre>`,
    '',
    '</details>',
    '',
  ].join('\n');
}
