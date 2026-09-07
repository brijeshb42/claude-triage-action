import type { ExecResult } from './bridge-client.js';
import { createRepositoryCommand } from './node-command.js';
import type { PreviewConfig } from './preview-config.js';

/**
 * Outcome of re-running the repository's preview validation commands in the sandbox after
 * Claude finishes. Model claims about the preview are only honored when this passes.
 */
export type PreviewValidationOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'unchanged' }
  | { status: 'passed'; commands: number }
  | { status: 'failed'; command: string; exitCode: number; output: string };

interface ExecClient {
  exec(
    sandboxId: string,
    argv: string[],
    options?: { cwd?: string; timeoutMs?: number; maxOutputChars?: number },
  ): Promise<ExecResult>;
}

const OUTPUT_TAIL_CHARS = 4_000;
const STATUS_TIMEOUT_MS = 120_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isPreviewValidationOutcome(value: unknown): value is PreviewValidationOutcome {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.status) {
    case 'skipped':
      return typeof value.reason === 'string';
    case 'unchanged':
      return true;
    case 'passed':
      return typeof value.commands === 'number';
    case 'failed':
      return (
        typeof value.command === 'string' &&
        typeof value.exitCode === 'number' &&
        typeof value.output === 'string'
      );
    default:
      return false;
  }
}

function outputTail(result: ExecResult): string {
  const combined = `${result.stdout}\n${result.stderr}`.trim();
  return combined.length <= OUTPUT_TAIL_CHARS ? combined : combined.slice(-OUTPUT_TAIL_CHARS);
}

/** Run each configured validation command in order and stop at the first failure. */
export async function validatePreview(
  client: ExecClient,
  sandboxId: string,
  nodeBinPath: string,
  config: PreviewConfig,
  timeoutMs: number,
): Promise<PreviewValidationOutcome> {
  if (config.validation.length === 0) {
    return { status: 'skipped', reason: 'no preview validation commands are configured' };
  }

  const status = await client.exec(
    sandboxId,
    ['git', 'status', '--porcelain=v1', '--untracked-files=all', '--', config.directory],
    { timeoutMs: STATUS_TIMEOUT_MS },
  );
  if (status.exitCode !== 0) {
    throw new Error(`Could not inspect the preview directory: ${status.stderr || status.stdout}`);
  }
  if (!status.stdout.trim()) {
    return { status: 'unchanged' };
  }

  for (const command of config.validation) {
    process.stderr.write(`Running preview validation: ${command}\n`);
    const result = await client.exec(
      sandboxId,
      ['bash', '-lc', createRepositoryCommand(`set -euo pipefail\n${command}`, nodeBinPath)],
      { timeoutMs, maxOutputChars: 1024 * 1024 },
    );
    if (result.exitCode !== 0) {
      return { status: 'failed', command, exitCode: result.exitCode, output: outputTail(result) };
    }
  }

  return { status: 'passed', commands: config.validation.length };
}

/** One line for logs and the published validation text. */
export function describePreviewValidation(outcome: PreviewValidationOutcome): string {
  switch (outcome.status) {
    case 'skipped':
      return `Deterministic preview validation skipped: ${outcome.reason}.`;
    case 'unchanged':
      return 'Deterministic preview validation skipped: the preview directory is unchanged.';
    case 'passed':
      return `Deterministic preview validation passed (${outcome.commands} commands).`;
    case 'failed':
      return (
        `Deterministic preview validation failed: ${JSON.stringify(outcome.command)} ` +
        `exited with code ${outcome.exitCode}.`
      );
  }
}
