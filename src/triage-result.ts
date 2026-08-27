export type TriageDisposition = 'actionable' | 'needs_information' | 'no_safe_fix' | 'out_of_scope';

export interface TriageResult {
  status: 'completed' | 'failed';
  disposition: TriageDisposition;
  summary: string;
  probableCause: string;
  confidence: 'low' | 'medium' | 'high';
  relevantPaths: string[];
  evidence: string[];
  validationPlan: string[];
  unresolvedQuestions: string[];
}

const DEFAULT_TRIAGE_RESULT: TriageResult = {
  status: 'failed',
  disposition: 'no_safe_fix',
  summary: 'Claude did not return a structured triage result.',
  probableCause: 'The triage step failed or reached its hard limit.',
  confidence: 'low',
  relevantPaths: [],
  evidence: [],
  validationPlan: [],
  unresolvedQuestions: ['Retry the read-only triage.'],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function compactText(value: string, maximumLength: number): string {
  const compacted = value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return compacted.length <= maximumLength
    ? compacted
    : `${compacted.slice(0, maximumLength - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatHtmlList(values: string[], ordered: boolean): string {
  if (values.length === 0) {
    return '<p>None.</p>';
  }

  const tag = ordered ? 'ol' : 'ul';
  const items = values
    .slice(0, 20)
    .map((value) => `<li><code>${escapeHtml(compactText(value, 2_000))}</code></li>`)
    .join('\n');
  return `<${tag}>\n${items}\n</${tag}>`;
}

/** Format the safe, single-line result shown in the Actions log. */
export function formatTriageLogLine(result: TriageResult): string {
  return (
    `Triage result: ${result.disposition}; ${result.confidence} confidence; ` +
    compactText(result.summary, 1_000)
  );
}

/** Format a compact human-readable Actions job summary without exposing raw model turns. */
export function formatTriageStepSummary(result: TriageResult): string {
  return [
    '## Claude read-only triage',
    '',
    `**Status:** \`${result.status}\` · **Disposition:** \`${result.disposition}\` · **Confidence:** \`${result.confidence}\``,
    '',
    '### Summary',
    '',
    `<pre>${escapeHtml(compactText(result.summary, 4_000))}</pre>`,
    '',
    '### Probable cause',
    '',
    `<pre>${escapeHtml(compactText(result.probableCause, 4_000))}</pre>`,
    '',
    '### Relevant paths',
    '',
    formatHtmlList(result.relevantPaths, false),
    '',
    '### Validation plan',
    '',
    formatHtmlList(result.validationPlan, true),
    '',
  ].join('\n');
}

export function isTriageResult(value: unknown): value is TriageResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.status === 'completed' || value.status === 'failed') &&
    (value.disposition === 'actionable' ||
      value.disposition === 'needs_information' ||
      value.disposition === 'no_safe_fix' ||
      value.disposition === 'out_of_scope') &&
    typeof value.summary === 'string' &&
    typeof value.probableCause === 'string' &&
    (value.confidence === 'low' || value.confidence === 'medium' || value.confidence === 'high') &&
    isStringArray(value.relevantPaths) &&
    isStringArray(value.evidence) &&
    isStringArray(value.validationPlan) &&
    isStringArray(value.unresolvedQuestions)
  );
}

function createApiFailureResult(executionMessages: unknown): TriageResult | undefined {
  if (!Array.isArray(executionMessages)) {
    return undefined;
  }

  const terminalResult = executionMessages.findLast(
    (message) =>
      isRecord(message) && message.type === 'result' && message.terminal_reason === 'api_error',
  );
  if (!isRecord(terminalResult)) {
    return undefined;
  }

  const detail = typeof terminalResult.result === 'string' ? terminalResult.result : '';
  if (detail.includes('Token exchange failed with status 401')) {
    const requestId = detail.match(/\breq_[A-Za-z0-9]+\b/)?.[0];
    return {
      ...DEFAULT_TRIAGE_RESULT,
      summary: 'Claude could not start because Anthropic rejected the workload identity token.',
      probableCause: requestId
        ? `The federation rule rejected this workflow token (Anthropic request ${requestId}).`
        : 'The federation rule rejected this workflow token.',
      confidence: 'high',
      unresolvedQuestions: ['Correct the Anthropic workload identity rule and retry.'],
    };
  }

  return {
    ...DEFAULT_TRIAGE_RESULT,
    summary: 'Claude could not complete the read-only triage because the API request failed.',
    probableCause: 'Claude Code reported a terminal API error before producing structured output.',
    confidence: 'high',
    unresolvedQuestions: ['Retry after checking Anthropic availability.'],
  };
}

/** Select a validated structured triage result or a safe failure classification. */
export function selectTriageResult(
  structuredResultJson: string | undefined,
  executionMessages: unknown,
): TriageResult {
  if (structuredResultJson) {
    try {
      const structuredResult: unknown = JSON.parse(structuredResultJson);
      if (isTriageResult(structuredResult)) {
        return structuredResult;
      }
    } catch {
      // Fall through to the execution diagnostics.
    }
  }

  return createApiFailureResult(executionMessages) ?? DEFAULT_TRIAGE_RESULT;
}
