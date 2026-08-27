#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { createArchiveChunks } from './archive.js';
import { SandboxBridgeClient } from './bridge-client.js';
import { loadBridgeEnvironment } from './config.js';
import { prepareNodeRuntime } from './node-runtime.js';

function requiredArgument(value: string | undefined, description: string): string {
  if (!value) {
    throw new Error(`Missing ${description}.`);
  }
  return value;
}

async function initializeRepository(client: SandboxBridgeClient, sandboxId: string): Promise<void> {
  const commands = [
    ['git', 'init', '-b', 'claude-triage-base', '.'],
    ['git', 'config', 'user.name', 'Claude Triage'],
    ['git', 'config', 'user.email', 'claude-triage@users.noreply.github.com'],
    ['git', 'add', '--force', '.'],
    ['git', 'commit', '-m', 'chore: sandbox baseline'],
  ];

  for (const argv of commands) {
    const result = await client.exec(sandboxId, argv, { timeoutMs: 300_000 });
    if (result.exitCode !== 0) {
      throw new Error(
        `Could not initialize sandbox repository with ${argv[0]}: ${result.stderr || result.stdout}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const bridge = loadBridgeEnvironment();
  const client = new SandboxBridgeClient(bridge.apiUrl, bridge.apiKey);

  if (command === 'create') {
    process.stdout.write(`${await client.create()}\n`);
    return;
  }

  if (command === 'destroy') {
    await client.destroy(requiredArgument(args[0], 'sandbox ID'));
    return;
  }

  if (command === 'hydrate-worktree') {
    const sandboxId = requiredArgument(args[0], 'sandbox ID');
    const repositoryDirectory = path.resolve(requiredArgument(args[1], 'repository directory'));
    const chunks = await createArchiveChunks(repositoryDirectory);
    let uploadedFiles = 0;

    for (const [index, chunk] of chunks.entries()) {
      await client.hydrate(sandboxId, chunk.bytes);
      uploadedFiles += chunk.fileCount;
      process.stderr.write(
        `Hydrated chunk ${index + 1}/${chunks.length} (${chunk.fileCount} tracked files).\n`,
      );
    }

    await initializeRepository(client, sandboxId);
    process.stderr.write(
      `Hydrated ${uploadedFiles} tracked files and created a baseline commit.\n`,
    );
    return;
  }

  if (command === 'prepare-node') {
    const sandboxId = requiredArgument(args[0], 'sandbox ID');
    const repositoryDirectory = path.resolve(requiredArgument(args[1], 'repository directory'));
    const requestedVersion = args[2] || 'auto';
    const runtime = await prepareNodeRuntime(
      client,
      sandboxId,
      repositoryDirectory,
      requestedVersion,
    );
    process.stderr.write(
      `Selected Node.js ${runtime.version} from ${runtime.requirement.source} ` +
        `(${runtime.requirement.range}).\n`,
    );
    process.stdout.write(`${JSON.stringify(runtime)}\n`);
    return;
  }

  if (command === 'export-patch') {
    const sandboxId = requiredArgument(args[0], 'sandbox ID');
    const outputPath = path.resolve(requiredArgument(args[1], 'patch output path'));
    const stageResult = await client.exec(sandboxId, ['git', 'add', '--all'], {
      timeoutMs: 120_000,
    });
    if (stageResult.exitCode !== 0) {
      throw new Error(`Could not stage the sandbox patch: ${stageResult.stderr}`);
    }
    const result = await client.exec(
      sandboxId,
      ['git', 'diff', '--cached', '--binary', '--no-ext-diff', 'HEAD', '--'],
      { timeoutMs: 120_000, maxOutputChars: 16 * 1024 * 1024 },
    );
    if (result.exitCode !== 0 || result.stdoutTruncated) {
      throw new Error(
        `Could not export complete patch: ${result.stderr || 'output was truncated'}`,
      );
    }
    await writeFile(outputPath, result.stdout);
    return;
  }

  if (command === 'upload-issue-context') {
    const sandboxId = requiredArgument(args[0], 'sandbox ID');
    const inputPath = path.resolve(requiredArgument(args[1], 'issue context path'));
    await client.writeFile(sandboxId, '/workspace/issue.json', await readFile(inputPath, 'utf8'));
    return;
  }

  if (command === 'mcp-config') {
    const serverPath = path.resolve(requiredArgument(args[0], 'MCP server path'));
    const nodeBinPath = args[1];
    process.stdout.write(
      `${JSON.stringify({
        mcpServers: {
          sandbox: {
            type: 'stdio',
            command: 'node',
            args: [serverPath],
            ...(nodeBinPath ? { env: { SANDBOX_NODE_BIN: nodeBinPath } } : {}),
          },
        },
      })}\n`,
    );
    return;
  }

  throw new Error(
    'Usage: sandbox-cli <create|destroy|hydrate-worktree|prepare-node|upload-issue-context|export-patch|mcp-config> [...args]',
  );
}

await main();
