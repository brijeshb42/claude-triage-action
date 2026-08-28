import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRunMetadata, formatRunFooter, isRunMetadata } from '../src/run-metadata.js';

describe('createRunMetadata', () => {
  it('captures the terminal Claude result and trusted run configuration', () => {
    const metadata = createRunMetadata(
      [
        { type: 'assistant' },
        {
          type: 'result',
          num_turns: 57,
          duration_ms: 707_000,
          total_cost_usd: 6.5,
        },
      ],
      {
        model: 'claude-opus-5',
        reasoningEffort: 'high',
        reviewDepth: 'medium',
      },
    );

    assert.deepEqual(metadata, {
      agent: 'Claude Code',
      model: 'claude-opus-5',
      reasoningEffort: 'high',
      reviewDepth: 'medium',
      turns: 57,
      durationMs: 707_000,
      costUsd: 6.5,
    });
    assert.equal(isRunMetadata(metadata), true);
  });

  it('omits malformed execution telemetry instead of publishing it', () => {
    const metadata = createRunMetadata(
      [{ type: 'result', num_turns: -1, duration_ms: 'slow', total_cost_usd: Number.NaN }],
      {
        model: 'claude-sonnet-4-6',
        reasoningEffort: 'high',
        reviewDepth: 'medium',
      },
    );

    assert.equal(metadata.turns, undefined);
    assert.equal(metadata.durationMs, undefined);
    assert.equal(metadata.costUsd, undefined);
  });
});

describe('formatRunFooter', () => {
  it('uses the established MUI review footer format', () => {
    const footer = formatRunFooter(
      {
        agent: 'Claude Code',
        model: 'claude-opus-5',
        reasoningEffort: 'high',
        reviewDepth: 'medium',
        turns: 57,
        durationMs: 707_000,
        costUsd: 6.5,
      },
      'https://github.com/example/project/actions/runs/123',
    );

    assert.equal(
      footer,
      '\n\n---\n\n_🤖 Review generated with Claude Code · Opus 5 (High) · `medium` review depth · 57 turns · 11m47s · $6.50 · [run](https://github.com/example/project/actions/runs/123)_',
    );
  });
});
