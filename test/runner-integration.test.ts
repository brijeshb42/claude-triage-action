import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import type { runRunner as RunnerFunction, RunnerOptions } from '../src/runner-main.js';
import { startRunnerGateway } from '../src/runner-gateway.js';
import { RunnerNetwork } from '../src/runner-network.js';
import { runProcess } from '../src/runner-process.js';
import { createFixtureApi } from './fixtures/runner-api.js';

const enabled = process.env.RUNNER_INTEGRATION === '1';
const image = process.env.RUNNER_TEST_IMAGE || 'claude-runner-ci';
// Exercise the shipped bundle, not just the TypeScript implementation.
const { runRunner, RUNNER_RESOLVER_PATH } = (await import(
  new URL('../dist/runner-main.mjs', import.meta.url).href
)) as {
  runRunner: typeof RunnerFunction;
  RUNNER_RESOLVER_PATH: string;
};
const command = async (name: string, args: string[], cwd?: string) => {
  const result = await runProcess(name, args, { ...(cwd ? { cwd } : {}) });
  assert.equal(result.exitCode, 0, result.stderr);
  return result.stdout;
};

test(
  'real gVisor isolates host services and credentials, and supports public dependency access',
  { skip: !enabled, timeout: 120_000 },
  async () => {
    const server = createServer((_req, res) => res.end('host-canary'));
    await new Promise<void>((resolve) => server.listen(0, '0.0.0.0', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const deniedServer = createServer((_req, res) => res.end('must-not-be-reachable'));
    await new Promise<void>((resolve) => deniedServer.listen(0, '0.0.0.0', resolve));
    const deniedAddress = deniedServer.address();
    assert.ok(deniedAddress && typeof deniedAddress !== 'string');
    const network = await RunnerNetwork.create(address.port);
    const name = `runner-probe-${Date.now()}`;
    try {
      await command('docker', [
        'run',
        '-d',
        '--name',
        name,
        '--runtime',
        'claude-runsc',
        '--network',
        network.name,
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--mount',
        `type=bind,src=${RUNNER_RESOLVER_PATH},dst=/etc/resolv.conf,readonly`,
        image,
      ]);
      const exec = (script: string) => command('docker', ['exec', name, 'bash', '-c', script]);
      assert.match(await exec('dmesg'), /gVisor/);
      assert.equal(
        await exec(`curl -fsS --max-time 5 http://${network.gateway}:${address.port}`),
        'host-canary',
      );
      await exec(`! curl -fsS --max-time 2 http://${network.gateway}:${deniedAddress.port}`);
      await exec('! curl -fsS --max-time 2 http://169.254.169.254');
      await exec('test ! -e /var/run/docker.sock && test ! -e /home/runner && test ! -e /github');
      const env = await exec('env');
      assert.doesNotMatch(env, /ACTIONS_ID_TOKEN|GITHUB_TOKEN|ANTHROPIC|RUNNER_GITHUB/);
      await exec('curl -fsS --max-time 20 https://registry.npmjs.org/pnpm/latest > /dev/null');
    } finally {
      await command('docker', ['rm', '--force', name]);
      await network.dispose();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await new Promise<void>((resolve) => deniedServer.close(() => resolve()));
    }
  },
);

test(
  'real gVisor supervisor runs actual Claude native tools and exports a publisher-compatible patch',
  { skip: !enabled, timeout: 300_000 },
  async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'runner-integration-'));
    try {
      await writeFile(path.join(directory, 'fixture.txt'), 'broken\n');
      await writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({
          name: 'runner-fixture',
          private: true,
          packageManager: 'pnpm@11.24.0',
          engines: { pnpm: '11.24.0' },
          scripts: { preinstall: 'npx --yes only-allow@1.2.1 pnpm' },
        }),
      );
      await command('git', ['init', '-b', 'main'], directory);
      await command('git', ['config', 'user.name', 'Fixture'], directory);
      await command('git', ['config', 'user.email', 'fixture@example.invalid'], directory);
      await command('git', ['add', 'fixture.txt', 'package.json'], directory);
      await command('git', ['commit', '-m', 'fixture baseline'], directory);
      const outputDirectory = path.join(directory, 'result');
      const options: RunnerOptions = {
        repositoryDirectory: directory,
        issueContext: '{"body":"Fix fixture.txt"}',
        outputDirectory,
        image,
        model: 'claude-sonnet-4-6',
        effort: 'high',
        maxTurns: 10,
        maxRequests: 20,
        maxTokens: 16384,
        timeoutMs: 120_000,
        installTimeoutMs: 120_000,
        installCommand: 'test "$(pnpm --version)" = 11.24.0 && pnpm install --lockfile=false',
        snapshotExcludes: [],
      };
      await runRunner(options, () =>
        startRunnerGateway({
          model: options.model,
          maxRequests: options.maxRequests,
          maxTokens: options.maxTokens,
          credential: async () => ({ headers: { 'x-api-key': 'host-canary-key' } }),
          request: createFixtureApi(),
        }),
      );
      const result = JSON.parse(
        await readFile(path.join(outputDirectory, 'claude-triage-result.json'), 'utf8'),
      );
      assert.equal(result.fixComplete, true);
      assert.equal(result.previewReady, false);
      const patch = await readFile(path.join(outputDirectory, 'claude-triage.patch'), 'utf8');
      assert.match(patch, /\+fixed/);
      assert.doesNotMatch(patch, /host-canary-key/);
      assert.equal(await readFile(path.join(directory, 'fixture.txt'), 'utf8'), 'broken\n');
      await command(
        'git',
        ['apply', '--check', path.join(outputDirectory, 'claude-triage.patch')],
        directory,
      );
      // A failing install can leave a child behind; the host must still remove all resources.
      await assert.rejects(
        runRunner(
          {
            ...options,
            outputDirectory: path.join(directory, 'failed-result'),
            installCommand: 'sleep 300 & exit 1',
          },
          () =>
            startRunnerGateway({
              model: options.model,
              maxRequests: 20,
              maxTokens: 16384,
              credential: async () => ({ headers: { 'x-api-key': 'unused' } }),
              request: createFixtureApi(),
            }),
        ),
        /Docker exec failed/,
      );
      assert.equal(
        await readFile(path.join(directory, 'failed-result/claude-triage.patch'), 'utf8'),
        '',
      );
      assert.equal(
        (
          await command('docker', [
            'ps',
            '-a',
            '--filter',
            'name=claude-runner-',
            '--format',
            '{{.Names}}',
          ])
        ).trim(),
        '',
      );
      assert.equal(
        (
          await command('docker', [
            'volume',
            'ls',
            '--filter',
            'label=claude-triage-runner=true',
            '--format',
            '{{.Name}}',
          ])
        ).trim(),
        '',
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
