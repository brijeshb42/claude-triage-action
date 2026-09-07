import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ExecResult } from '../src/bridge-client.js';
import {
  describePreviewValidation,
  isPreviewValidationOutcome,
  validatePreview,
} from '../src/preview-validation.js';

const NODE_BIN = '/workspace/.claude-triage/node/v22.23.2/bin';

function exec(exitCode: number, stdout = '', stderr = ''): ExecResult {
  return { exitCode, stdout, stderr, stdoutTruncated: false, stderrTruncated: false };
}

function fakeClient(responses: ExecResult[]) {
  const calls: string[][] = [];
  return {
    calls,
    async exec(_sandboxId: string, argv: string[]) {
      calls.push(argv);
      const response = responses.shift();
      if (!response) {
        throw new Error('Unexpected exec call.');
      }
      return response;
    },
  };
}

const config = {
  directory: 'examples/triage-preview',
  validation: [
    'pnpm --dir examples/triage-preview install',
    'pnpm --dir examples/triage-preview build',
  ],
};

describe('validatePreview', () => {
  it('skips when the preview directory is untouched', async () => {
    const client = fakeClient([exec(0, '')]);

    assert.deepEqual(await validatePreview(client, 'sb', NODE_BIN, config, 1_000), {
      status: 'unchanged',
    });
    assert.deepEqual(client.calls[0], [
      'git',
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      'examples/triage-preview',
    ]);
  });

  it('runs every command with the sandbox Node runtime on PATH', async () => {
    const client = fakeClient([
      exec(0, ' M examples/triage-preview/src/App.tsx\n'),
      exec(0),
      exec(0),
    ]);

    assert.deepEqual(await validatePreview(client, 'sb', NODE_BIN, config, 1_000), {
      status: 'passed',
      commands: 2,
    });
    assert.equal(client.calls.length, 3);
    assert.match(String(client.calls[1]?.[2]), /export PATH='\/workspace\/\.claude-triage/);
    assert.match(String(client.calls[2]?.[2]), /build$/);
  });

  it('stops at the first failing command and keeps only the output tail', async () => {
    const client = fakeClient([
      exec(0, '?? examples/triage-preview/src/Demo.tsx\n'),
      exec(1, 'a'.repeat(5_000), 'ERR_PNPM'),
    ]);

    const outcome = await validatePreview(client, 'sb', NODE_BIN, config, 1_000);

    assert.equal(outcome.status, 'failed');
    assert.ok(outcome.status === 'failed');
    assert.equal(outcome.command, config.validation[0]);
    assert.equal(outcome.exitCode, 1);
    assert.equal(outcome.output.length, 4_000);
    assert.ok(outcome.output.endsWith('ERR_PNPM'));
    assert.equal(client.calls.length, 2);
  });

  it('skips when no validation commands are configured', async () => {
    const client = fakeClient([]);

    assert.deepEqual(
      await validatePreview(client, 'sb', NODE_BIN, { directory: 'x', validation: [] }, 1_000),
      { status: 'skipped', reason: 'no preview validation commands are configured' },
    );
  });
});

describe('isPreviewValidationOutcome', () => {
  it('accepts every outcome shape and rejects others', () => {
    assert.equal(isPreviewValidationOutcome({ status: 'unchanged' }), true);
    assert.equal(isPreviewValidationOutcome({ status: 'passed', commands: 2 }), true);
    assert.equal(
      isPreviewValidationOutcome({ status: 'failed', command: 'x', exitCode: 2, output: '' }),
      true,
    );
    assert.equal(isPreviewValidationOutcome({ status: 'failed' }), false);
    assert.equal(isPreviewValidationOutcome({ status: 'other' }), false);
    assert.equal(isPreviewValidationOutcome(null), false);
  });
});

describe('describePreviewValidation', () => {
  it('names the failing command and exit code', () => {
    assert.equal(
      describePreviewValidation({
        status: 'failed',
        command: 'pnpm build',
        exitCode: 2,
        output: '',
      }),
      'Deterministic preview validation failed: "pnpm build" exited with code 2.',
    );
  });
});
