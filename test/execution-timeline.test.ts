import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractTimeline,
  formatTimeline,
  formatTimelineSummary,
} from '../src/execution-timeline.js';

const messages = [
  { type: 'system', subtype: 'init', model: 'claude-sonnet-4-6' },
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Starting.' },
        { type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'mui-fix-ci' } },
      ],
    },
  },
  {
    type: 'user',
    message: { content: [{ type: 'tool_result', tool_use_id: 'a', content: 'loaded' }] },
  },
  {
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          id: 'b',
          name: 'mcp__sandbox__exec',
          input: { command: 'pnpm test:node   mergeSlotProps\n2>&1', cwd: '.' },
        },
        {
          type: 'tool_use',
          id: 'c',
          name: 'mcp__sandbox__write_file',
          input: { path: 'packages/x.ts', content: 'x'.repeat(500) },
        },
      ],
    },
  },
  {
    type: 'user',
    message: {
      content: [
        {
          type: 'tool_result',
          tool_use_id: 'b',
          content: [{ type: 'text', text: 'y'.repeat(1_234) }],
        },
        { type: 'tool_result', tool_use_id: 'c', content: 'denied', is_error: true },
      ],
    },
  },
  { type: 'result', num_turns: 2 },
];

describe('extractTimeline', () => {
  it('numbers tool calls by assistant turn and pairs their results', () => {
    assert.deepEqual(extractTimeline(messages), [
      { turn: 1, tool: 'Skill', input: 'mui-fix-ci', resultChars: 6 },
      {
        turn: 2,
        tool: 'mcp__sandbox__exec',
        input: 'pnpm test:node mergeSlotProps 2>&1',
        resultChars: 1_234,
      },
      {
        turn: 2,
        tool: 'mcp__sandbox__write_file',
        input: 'packages/x.ts',
        resultChars: 6,
        isError: true,
      },
    ]);
  });

  it('truncates long inputs and ignores malformed messages', () => {
    const [entry] = extractTimeline([
      null,
      'text',
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'a', name: 'Read', input: { other: 'z'.repeat(300) } }],
        },
      },
    ]);

    assert.ok(entry);
    assert.equal(entry.input.length, 100);
    assert.ok(entry.input.endsWith('…'));
    assert.equal(entry.resultChars, undefined);
  });
});

describe('formatTimeline', () => {
  it('prints an aligned one-line-per-call log', () => {
    const lines = formatTimeline(messages).split('\n');

    assert.equal(lines[0], 'Claude timeline: 3 tool calls over 2 turns, 1 errored.');
    assert.equal(lines[1], 'turn 1    Skill                    mui-fix-ci  → 6 chars');
    assert.equal(
      lines[2],
      'turn 2    mcp__sandbox__exec       pnpm test:node mergeSlotProps 2>&1  → 1.2k chars',
    );
    assert.equal(lines[3], 'turn 2    mcp__sandbox__write_file packages/x.ts  → error');
  });

  it('reports an empty execution instead of throwing', () => {
    assert.equal(formatTimeline(undefined), 'Claude timeline: no tool calls were recorded.');
  });

  it('escapes the step summary', () => {
    const summary = formatTimelineSummary([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'a', name: 'Grep', input: { pattern: '<b>&' } }],
        },
      },
    ]);

    assert.match(summary, /<details>/);
    assert.match(summary, /&lt;b&gt;&amp;/);
  });
});
