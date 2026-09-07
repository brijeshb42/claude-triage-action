import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
import { claudeArguments, type RunnerOptions } from '../src/runner-main.js';
import { runProcess } from '../src/runner-process.js';

test('native Claude invocation ignores project settings, hooks, MCP and skills', () => {
  const args = claudeArguments({
    model: 'claude-sonnet-4-6',
    effort: 'high',
    maxTurns: 10,
  } as RunnerOptions);
  assert.equal(args[args.indexOf('--tools') + 1], 'Read,Write,Edit,Glob,Grep,Bash');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(args.includes('--disable-slash-commands'));
  assert.equal(args[0], '/usr/local/bin/claude');
});

test('runner publisher retains existing model-free patch validation and draft behavior', async () => {
  const existing = await readFile('publish/action.yml', 'utf8');
  const runner = await readFile('runner/publish/action.yml', 'utf8');
  assert.deepEqual(
    parse(runner),
    parse(
      existing
        .replaceAll('Cloudflare-sandboxed', 'Runner-sandboxed')
        .replaceAll('$GITHUB_ACTION_PATH/../dist/', '$GITHUB_ACTION_PATH/../../dist/')
        .replace(
          'description: Artifact produced by the triage action.',
          'description: Artifact produced by the runner action.',
        ),
    ),
  );
  assert.match(runner, /draft: true/);
  assert.doesNotMatch(runner, /ANTHROPIC|anthropics\/claude/);
});

test('runner workflow separates read-only model credentials from GitHub publication', async () => {
  const workflow = parse(await readFile('.github/workflows/runner-example.yml', 'utf8'));
  assert.deepEqual(workflow.jobs.agent.permissions, {
    contents: 'read',
    issues: 'read',
    'id-token': 'write',
  });
  assert.equal(workflow.jobs.publish.needs, 'agent');
  assert.equal(workflow.jobs.publish.permissions.contents, 'write');
  assert.equal(workflow.jobs.publish.permissions['id-token'], undefined);
  const action = parse(await readFile('runner/action.yml', 'utf8'));
  const steps = action.runs.steps;
  const agent = steps.find((step: { id?: string }) => step.id === 'agent');
  assert.ok(agent.env.RUNNER_ANTHROPIC_API_KEY);
  for (const step of steps) {
    if (step !== agent) assert.equal(step.env, undefined);
    if (step.uses) assert.match(step.uses, /@[0-9a-f]{40}$/);
  }
});

test('bounded process capture preserves output without interpreting workflow commands', async () => {
  const result = await runProcess(process.execPath, [
    '-e',
    'console.log("::error::untrusted"); process.exitCode=3',
  ]);
  assert.equal(result.exitCode, 3);
  assert.equal(result.stdout, '::error::untrusted\n');
});

test('runner consumes a prebuilt digest without package-write permissions or a build', async () => {
  const action = parse(await readFile('runner/action.yml', 'utf8'));
  const image = action.runs.steps.find((step: { id?: string }) => step.id === 'image');
  assert.match(image.run, /docker pull/);
  assert.doesNotMatch(image.run, /docker build|docker login/);
  assert.match(
    (await readFile('runner/image.txt', 'utf8')).trim(),
    /^ghcr\.io\/brijeshb42\/claude-triage-runner@sha256:[a-f0-9]{64}$/,
  );
  assert.equal(action.inputs['repository-node-version'].default, 'auto');
});

test('bounded process capture rejects truncation, timeout and cancellation', async () => {
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'console.log("x".repeat(1000))'], { maxBytes: 50 }),
    /output limit/,
  );
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 50 }),
    /deadline/,
  );
  const signal = AbortSignal.abort();
  await assert.rejects(
    runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal }),
    /cancelled/,
  );
});
