export interface AgentResult {
  summary: string;
  probableCause: string;
  confidence: 'low' | 'medium' | 'high';
  fixAttempted: boolean;
  fixComplete: boolean;
  prTitle: string;
  prBody: string;
  validation: string;
  previewAttempted: boolean;
  previewReady: boolean;
  previewValidation: string;
}

const DEFAULT_AGENT_RESULT: AgentResult = {
  summary: 'Claude did not return a structured triage result.',
  probableCause: 'The agent step failed or reached its hard limit.',
  confidence: 'low',
  fixAttempted: false,
  fixComplete: false,
  prTitle: '',
  prBody: '',
  validation: 'No validation result was returned.',
  previewAttempted: false,
  previewReady: false,
  previewValidation: 'No preview validation result was returned.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAgentResult(value: unknown): value is AgentResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.summary === 'string' &&
    typeof value.probableCause === 'string' &&
    (value.confidence === 'low' || value.confidence === 'medium' || value.confidence === 'high') &&
    typeof value.fixAttempted === 'boolean' &&
    typeof value.fixComplete === 'boolean' &&
    typeof value.prTitle === 'string' &&
    typeof value.prBody === 'string' &&
    typeof value.validation === 'string' &&
    typeof value.previewAttempted === 'boolean' &&
    typeof value.previewReady === 'boolean' &&
    typeof value.previewValidation === 'string'
  );
}

function createApiFailureResult(executionMessages: unknown): AgentResult | undefined {
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
      ...DEFAULT_AGENT_RESULT,
      summary: 'Claude could not start because Anthropic rejected the workload identity token.',
      probableCause: requestId
        ? `The configured federation rule did not authorize this workflow's GitHub OIDC token (Anthropic request ${requestId}).`
        : `The configured federation rule did not authorize this workflow's GitHub OIDC token.`,
      confidence: 'high',
      validation:
        'No model request or sandbox tool call ran. Correct the Anthropic workload identity rule and retry.',
    };
  }

  return {
    ...DEFAULT_AGENT_RESULT,
    summary: 'Claude could not complete the triage because the Anthropic API request failed.',
    probableCause: 'Claude Code reported a terminal API error before producing structured output.',
    confidence: 'high',
    validation:
      'No validated triage result was returned; retry after checking Anthropic availability.',
  };
}

/** Select a validated structured result or a safe failure classification. */
export function selectAgentResult(
  structuredResultJson: string | undefined,
  executionMessages: unknown,
): AgentResult {
  if (structuredResultJson) {
    try {
      const structuredResult: unknown = JSON.parse(structuredResultJson);
      if (isAgentResult(structuredResult)) {
        return structuredResult;
      }
    } catch {
      // Fall through to the execution diagnostics.
    }
  }

  return createApiFailureResult(executionMessages) ?? DEFAULT_AGENT_RESULT;
}
