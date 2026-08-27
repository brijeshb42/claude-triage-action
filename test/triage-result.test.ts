import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatTriageLogLine,
  formatTriageStepSummary,
  selectTriageResult,
  type TriageResult,
} from '../src/triage-result.js';

const COMPLETE_RESULT: TriageResult = {
  status: 'completed',
  disposition: 'actionable',
  summary: 'The internal ref is\n overwritten.',
  probableCause: 'Object spread replaces the <internal> ref.',
  confidence: 'medium',
  relevantPaths: ['src/example.ts'],
  evidence: ['The external value is spread after the default value.'],
  validationPlan: ['Add a regression test for two refs.'],
  unresolvedQuestions: ['Whether callback cleanup must be composed.'],
};

describe('selectTriageResult', () => {
  it('accepts a complete read-only triage handoff', () => {
    assert.deepEqual(selectTriageResult(JSON.stringify(COMPLETE_RESULT), []), COMPLETE_RESULT);
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

describe('triage summaries', () => {
  it('writes one compact line to the Actions log', () => {
    assert.equal(
      formatTriageLogLine(COMPLETE_RESULT),
      'Triage result: actionable; medium confidence; The internal ref is overwritten.',
    );
  });

  it('writes readable structured details without rendering model-provided HTML', () => {
    const summary = formatTriageStepSummary(COMPLETE_RESULT);

    assert.match(summary, /## Claude read-only triage/);
    assert.match(summary, /`completed`.*`actionable`.*`medium`/);
    assert.match(summary, /Object spread replaces the &lt;internal&gt; ref\./);
    assert.match(summary, /<li><code>src\/example\.ts<\/code><\/li>/);
    assert.match(summary, /Add a regression test for two refs\./);
    assert.doesNotMatch(summary, /<internal>/);
  });
});
