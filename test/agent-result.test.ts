import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectAgentResult } from '../src/agent-result.js';

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
