// Runs inside the built image with --network none: actual CLI, fake upstream.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { claudeArguments, type RunnerOptions } from '../../src/runner-main.js';
import { startRunnerGateway } from '../../src/runner-gateway.js';
import { runProcess } from '../../src/runner-process.js';
import { createFixtureApi } from './runner-api.js';

await mkdir('/workspace/repo', { recursive: true });
const gateway = await startRunnerGateway({
  model: 'claude-sonnet-4-6',
  maxRequests: 20,
  maxTokens: 16384,
  credential: async () => ({ headers: { 'x-api-key': 'fake-host-only-key' } }),
  host: '127.0.0.1',
  request: createFixtureApi(),
});
try {
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${gateway.port}`;
  process.env.ANTHROPIC_AUTH_TOKEN = gateway.capability;
  process.env.ANTHROPIC_API_KEY = '';
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1';
  process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = '16384';
  process.env.CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY = '0';
  process.env.DISABLE_AUTOUPDATER = '1';
  const [command, ...args] = claudeArguments({
    model: 'claude-sonnet-4-6',
    effort: 'high',
    maxTurns: 10,
  } as RunnerOptions);
  const result = await runProcess(command!, args, {
    cwd: '/workspace/repo',
    input: 'Fix fixture.txt and return the structured result.',
    timeoutMs: 120_000,
  });
  assert.equal(result.exitCode, 0, result.stderr + result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.subtype, 'success', result.stdout);
  assert.equal(parsed.structured_output.fixComplete, true);
  assert.equal(await readFile('/workspace/repo/fixture.txt', 'utf8'), 'fixed\n');
  console.log(
    'Actual Claude CLI completed native Bash execution and structured output through the gateway.',
  );
} finally {
  await gateway.close();
}
