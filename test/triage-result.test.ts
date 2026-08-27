import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectTriageResult } from '../src/triage-result.js';

describe('selectTriageResult', () => {
  it('accepts a complete read-only triage handoff', () => {
    const structuredResult = {
      status: 'completed',
      disposition: 'actionable',
      summary: 'The internal ref is overwritten.',
      probableCause: 'Object spread replaces the internal ref.',
      confidence: 'medium',
      relevantPaths: ['src/example.ts'],
      evidence: ['The external value is spread after the default value.'],
      validationPlan: ['Add a regression test for two refs.'],
      unresolvedQuestions: ['Whether callback cleanup must be composed.'],
    };

    assert.deepEqual(selectTriageResult(JSON.stringify(structuredResult), []), structuredResult);
  });

  it('marks malformed model output as failed and non-actionable', () => {
    const result = selectTriageResult('{', []);

    assert.equal(result.status, 'failed');
    assert.equal(result.disposition, 'no_safe_fix');
  });

  it('does not copy arbitrary API failure output into the artifact', () => {
    const result = selectTriageResult(undefined, [
      {
        type: 'result',
        terminal_reason: 'api_error',
        result:
          'API Error: Token exchange failed with status 401 (request-id req_0123456789): secret-data',
      },
    ]);

    assert.equal(result.status, 'failed');
    assert.match(result.probableCause, /req_0123456789/);
    assert.doesNotMatch(JSON.stringify(result), /secret-data/);
  });
});
