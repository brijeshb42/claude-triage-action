import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyPreviewValidation, selectAgentResult } from '../src/agent-result.js';

describe('selectAgentResult', () => {
  it('prefers a valid structured result', () => {
    const structuredResult = {
      summary: 'Fixed the problem.',
      probableCause: 'An edge case was not handled.',
      confidence: 'high',
      fixAttempted: true,
      fixComplete: true,
      prTitle: 'Fix the edge case',
      prBody: 'Includes a regression test.',
      validation: 'Targeted test passed.',
      previewAttempted: false,
      previewReady: false,
      previewValidation: 'Not requested.',
    };

    assert.deepEqual(selectAgentResult(JSON.stringify(structuredResult), []), structuredResult);
  });

  it('classifies a workload identity rejection without copying arbitrary API output', () => {
    const result = selectAgentResult(undefined, [
      {
        type: 'result',
        terminal_reason: 'api_error',
        result:
          'API Error: Token exchange failed with status 401 (request-id req_0123456789): secret-data',
      },
    ]);

    assert.equal(
      result.summary,
      'Claude could not start because Anthropic rejected the workload identity token.',
    );
    assert.equal(result.confidence, 'high');
    assert.match(result.probableCause, /req_0123456789/);
    assert.doesNotMatch(JSON.stringify(result), /secret-data/);
  });

  it('uses the generic fallback for malformed structured and execution data', () => {
    const result = selectAgentResult('{', { type: 'result' });

    assert.equal(result.confidence, 'low');
    assert.equal(result.fixAttempted, false);
    assert.match(result.summary, /did not return a structured triage result/);
  });
});

describe('applyPreviewValidation', () => {
  const claimed = {
    summary: 's',
    probableCause: 'p',
    confidence: 'high' as const,
    fixAttempted: true,
    fixComplete: true,
    prTitle: 't',
    prBody: 'b',
    validation: 'v',
    previewAttempted: true,
    previewReady: true,
    previewValidation: 'Model ran the build.',
  };

  it('keeps a claimed preview only when the deterministic run passed', () => {
    const result = applyPreviewValidation(claimed, { status: 'passed', commands: 2 });

    assert.equal(result.previewReady, true);
    assert.equal(
      result.previewValidation,
      'Model ran the build.\nDeterministic preview validation passed (2 commands).',
    );
  });

  it('withdraws the claim when validation failed, found no changes, or did not run', () => {
    const failed = applyPreviewValidation(claimed, {
      status: 'failed',
      command: 'pnpm build',
      exitCode: 1,
      output: 'boom',
    });
    assert.equal(failed.previewReady, false);
    assert.match(failed.previewValidation, /"pnpm build" exited with code 1/);

    assert.equal(applyPreviewValidation(claimed, { status: 'unchanged' }).previewReady, false);

    const missing = applyPreviewValidation(claimed, undefined);
    assert.equal(missing.previewReady, false);
    assert.match(missing.previewValidation, /did not run/);
  });

  it('honors the claim when the repository configures no validation commands', () => {
    const result = applyPreviewValidation(claimed, {
      status: 'skipped',
      reason: 'no preview validation commands are configured',
    });

    assert.equal(result.previewReady, true);
  });

  it('never promotes an unclaimed preview', () => {
    const result = applyPreviewValidation(
      { ...claimed, previewReady: false },
      { status: 'passed', commands: 2 },
    );

    assert.equal(result.previewReady, false);
  });
});
