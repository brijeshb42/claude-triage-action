#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRepositoryArchive, readArchiveParts, type RepositoryArchive } from './archive.js';
import { SandboxBridgeClient } from './bridge-client.js';
import { loadBridgeEnvironment } from './config.js';
import { prepareNodeRuntime } from './node-runtime.js';

const HYDRATE_ATTEMPTS = 3;
const HYDRATE_ARCHIVE_PATH = '/workspace/.claude-triage-repository.tar.gz';
const HYDRATE_BOOTSTRAP_PATH = '/workspace/.claude-triage-bootstrap';
const HYDRATE_COMPLETE_PATH = '/workspace/.claude-triage-hydrated';
const HYDRATE_PART_PREFIX = '/workspace/.claude-triage-part-';

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function requiredArgument(value: string | undefined, description: string): string {
  if (!value) {
    throw new Error(`Missing ${description}.`);
  }
  return value;
}

function parseSnapshotExclusions(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0 && !pattern.startsWith('#'));
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

async function writeFileWithRetries(
  client: SandboxBridgeClient,
  sandboxId: string,
  filePath: string,
  content: string | Uint8Array,
  description: string,
): Promise<void> {
  for (let attempt = 1; attempt <= HYDRATE_ATTEMPTS; attempt += 1) {
    try {
      await client.writeFile(sandboxId, filePath, content);
      return;
    } catch (error) {
      if (attempt === HYDRATE_ATTEMPTS) {
        throw error;
      }
      process.stderr.write(
        `${description} attempt ${attempt}/${HYDRATE_ATTEMPTS} failed: ` +
          `${error instanceof Error ? error.message : String(error)}; retrying this file.\n`,
      );
      await delay(1_000 * 2 ** (attempt - 1));
    }
  }
}

async function archiveWasExtracted(
  client: SandboxBridgeClient,
  sandboxId: string,
  archiveSha256: string,
): Promise<boolean> {
  try {
    return (await client.readFile(sandboxId, HYDRATE_COMPLETE_PATH)).trim() === archiveSha256;
  } catch {
    return false;
  }
}

async function extractRepositoryArchive(
  client: SandboxBridgeClient,
  sandboxId: string,
  archive: RepositoryArchive,
): Promise<void> {
  const partPaths = Array.from(
    { length: archive.partCount },
    (_, index) => `${HYDRATE_PART_PREFIX}${String(index).padStart(6, '0')}`,
  );
  const extractionScript = [
    'set -euo pipefail',
    `cat ${partPaths.map((partPath) => `'${partPath}'`).join(' ')} > '${HYDRATE_ARCHIVE_PATH}'`,
    `printf '%s  %s\\n' '${archive.sha256}' '${HYDRATE_ARCHIVE_PATH}' | sha256sum --check --status`,
    "mkdir -p '/workspace'",
    `tar --extract --gzip --file '${HYDRATE_ARCHIVE_PATH}' --directory '/workspace'`,
    `printf '%s\\n' '${archive.sha256}' > '${HYDRATE_COMPLETE_PATH}.tmp'`,
    `mv '${HYDRATE_COMPLETE_PATH}.tmp' '${HYDRATE_COMPLETE_PATH}'`,
  ].join('\n');

  for (let attempt = 1; attempt <= HYDRATE_ATTEMPTS; attempt += 1) {
    if (await archiveWasExtracted(client, sandboxId, archive.sha256)) {
      return;
    }

    try {
      const extractResult = await client.exec(sandboxId, ['bash', '-lc', extractionScript], {
        cwd: '/workspace',
        timeoutMs: 300_000,
      });
      if (extractResult.exitCode === 0) {
        return;
      }
      throw new Error(
        `Could not verify and extract the repository archive: ` +
          `${extractResult.stderr || extractResult.stdout}`,
      );
    } catch (error) {
      if (await archiveWasExtracted(client, sandboxId, archive.sha256)) {
        return;
      }
      if (attempt === HYDRATE_ATTEMPTS) {
        throw error;
      }
      process.stderr.write(
        `Archive extraction attempt ${attempt}/${HYDRATE_ATTEMPTS} failed: ` +
          `${error instanceof Error ? error.message : String(error)}; retrying extraction with ` +
          `the uploaded parts.\n`,
      );
      await delay(1_000 * 2 ** (attempt - 1));
    }
  }
}

async function cleanupHydrationFiles(
  client: SandboxBridgeClient,
  sandboxId: string,
): Promise<void> {
  try {
    const cleanupResult = await client.exec(
      sandboxId,
      [
        'bash',
        '-lc',
        `rm -f '${HYDRATE_PART_PREFIX}'* '${HYDRATE_ARCHIVE_PATH}' ` +
          `'${HYDRATE_BOOTSTRAP_PATH}' '${HYDRATE_COMPLETE_PATH}' ` +
          `'${HYDRATE_COMPLETE_PATH}.tmp'`,
      ],
      { cwd: '/workspace', timeoutMs: 120_000 },
    );
    if (cleanupResult.exitCode !== 0) {
      throw new Error(cleanupResult.stderr || cleanupResult.stdout);
    }
  } catch (error) {
    process.stderr.write(
      `Warning: could not remove repository hydration files: ` +
        `${error instanceof Error ? error.message : String(error)}.\n`,
    );
  }
}

export async function hydrateRepositoryArchive(
  client: SandboxBridgeClient,
  sandboxId: string,
  archive: RepositoryArchive,
): Promise<void> {
  // A small file operation waits for a cold container before the larger part uploads begin.
  await writeFileWithRetries(
    client,
    sandboxId,
    HYDRATE_BOOTSTRAP_PATH,
    'ready',
    'Sandbox bootstrap upload',
  );

  let uploadedParts = 0;
  for await (const part of readArchiveParts(archive.path, archive.partBytes)) {
    const partName = String(part.index).padStart(6, '0');
    await writeFileWithRetries(
      client,
      sandboxId,
      `${HYDRATE_PART_PREFIX}${partName}`,
      part.bytes,
      `Archive part ${part.index + 1}/${archive.partCount} upload`,
    );
    uploadedParts += 1;
    process.stderr.write(
      `Uploaded archive part ${uploadedParts}/${archive.partCount} (${part.bytes.byteLength} bytes).\n`,
    );
  }

  if (uploadedParts !== archive.partCount) {
    throw new Error(`Uploaded ${uploadedParts} archive parts; expected ${archive.partCount}.`);
  }

  await extractRepositoryArchive(client, sandboxId, archive);
  await cleanupHydrationFiles(client, sandboxId);
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
    const snapshotExclusions = parseSnapshotExclusions(args[2]);
    const archive = await createRepositoryArchive(
      repositoryDirectory,
      undefined,
      snapshotExclusions,
    );
    try {
      process.stderr.write(
        `Created ${archive.byteLength}-byte repository archive with ${archive.fileCount} tracked ` +
          `files in ${archive.partCount} parts.\n`,
      );
      if (snapshotExclusions.length > 0) {
        process.stderr.write(
          `Excluded snapshot paths matching: ${snapshotExclusions
            .map((pattern) => JSON.stringify(pattern))
            .join(', ')}.\n`,
        );
      }
      await hydrateRepositoryArchive(client, sandboxId, archive);
    } finally {
      await archive.dispose();
    }

    await initializeRepository(client, sandboxId);
    process.stderr.write(
      `Hydrated ${archive.fileCount} tracked files and created a baseline commit.\n`,
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
