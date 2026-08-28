export type ReasoningEffort = 'low' | 'medium' | 'high' | 'max';

export interface RunMetadata {
  agent: 'Claude Code';
  model: string;
  reasoningEffort: ReasoningEffort;
  turns?: number;
  durationMs?: number;
  costUsd?: number;
}

interface RunConfiguration {
  model: string;
  reasoningEffort: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'max';
}

function optionalNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalTurnCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function validateModel(model: string): string {
  const normalized = model.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error('MODEL must contain only letters, numbers, dots, underscores, and hyphens.');
  }
  return normalized;
}

/** Capture trusted run configuration plus best-effort Claude execution telemetry. */
export function createRunMetadata(
  executionMessages: unknown,
  configuration: RunConfiguration,
): RunMetadata {
  if (!isReasoningEffort(configuration.reasoningEffort)) {
    throw new Error(`Unsupported reasoning effort: ${configuration.reasoningEffort}`);
  }
  const terminalResult = Array.isArray(executionMessages)
    ? executionMessages.findLast((message) => isRecord(message) && message.type === 'result')
    : undefined;
  const result = isRecord(terminalResult) ? terminalResult : {};
  const turns = optionalTurnCount(result.num_turns);
  const durationMs = optionalNonNegativeNumber(result.duration_ms);
  const costUsd = optionalNonNegativeNumber(result.total_cost_usd);

  return {
    agent: 'Claude Code',
    model: validateModel(configuration.model),
    reasoningEffort: configuration.reasoningEffort,
    ...(turns === undefined ? {} : { turns }),
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(costUsd === undefined ? {} : { costUsd }),
  };
}

/** Check telemetry loaded from an artifact before using it in published Markdown. */
export function isRunMetadata(value: unknown): value is RunMetadata {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.agent === 'Claude Code' &&
    typeof value.model === 'string' &&
    /^[A-Za-z0-9._-]+$/.test(value.model) &&
    isReasoningEffort(value.reasoningEffort) &&
    (value.turns === undefined || optionalTurnCount(value.turns) !== undefined) &&
    (value.durationMs === undefined || optionalNonNegativeNumber(value.durationMs) !== undefined) &&
    (value.costUsd === undefined || optionalNonNegativeNumber(value.costUsd) !== undefined)
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatModel(model: string): string {
  const withoutVendor = model.startsWith('claude-') ? model.slice('claude-'.length) : model;
  const [family = '', ...version] = withoutVendor.split('-');
  return [titleCase(family), version.join('.')].filter(Boolean).join(' ');
}

function formatDuration(durationMs: number): string {
  const seconds = Math.round(durationMs / 1_000);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m${seconds % 60}s` : `${seconds}s`;
}

/** Format the standard review attribution footer used by MUI automation. */
export function formatRunFooter(metadata: RunMetadata, runUrl: string): string {
  const parsedRunUrl = new URL(runUrl);
  if (parsedRunUrl.protocol !== 'https:' && parsedRunUrl.protocol !== 'http:') {
    throw new Error('RUN_URL must use HTTP or HTTPS.');
  }

  const facts = [
    `${formatModel(metadata.model)} (${titleCase(metadata.reasoningEffort)})`,
    metadata.turns === undefined ? undefined : `${metadata.turns} turns`,
    metadata.durationMs === undefined ? undefined : formatDuration(metadata.durationMs),
    metadata.costUsd === undefined ? undefined : `$${metadata.costUsd.toFixed(2)}`,
    `[run](${parsedRunUrl.href})`,
  ].filter((fact): fact is string => fact !== undefined);

  return `\n\n---\n\n_${[`🤖 Review generated with ${metadata.agent}`, ...facts].join(' · ')}_`;
}
