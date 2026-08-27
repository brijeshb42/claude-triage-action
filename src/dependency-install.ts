import { lstat, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import type { SandboxBridgeClient } from './bridge-client.js';
import { createRepositoryCommand } from './node-command.js';

export interface DependencyInstallSources {
  packageJson?: string;
  npmLock?: boolean;
  pnpmLock?: boolean;
  yarnLock?: boolean;
}

export interface DependencyInstallPlan {
  command?: string;
  source: string;
}

function parsePackageManager(packageJson: string | undefined): string | undefined {
  if (!packageJson) {
    return undefined;
  }

  const value: unknown = JSON.parse(packageJson);
  if (typeof value !== 'object' || value === null) {
    throw new Error('The root package.json must contain a JSON object.');
  }

  return 'packageManager' in value && typeof value.packageManager === 'string'
    ? value.packageManager.trim()
    : undefined;
}

function yarnInstallCommand(packageManager: string | undefined): string {
  const majorVersion = packageManager?.match(/^yarn@(\d+)/)?.[1];
  return majorVersion && Number(majorVersion) >= 2
    ? 'yarn install --immutable'
    : 'yarn install --frozen-lockfile';
}

export function detectDependencyInstallPlan(
  sources: DependencyInstallSources,
  requestedCommand = 'auto',
): DependencyInstallPlan {
  const normalizedCommand = requestedCommand.trim();
  if (!normalizedCommand || normalizedCommand === 'none') {
    return { source: 'disabled by action input' };
  }
  if (normalizedCommand !== 'auto') {
    if (normalizedCommand.length > 10_000 || normalizedCommand.includes('\0')) {
      throw new Error('The dependency install command is invalid.');
    }
    return { command: normalizedCommand, source: 'action input' };
  }

  const packageManager = parsePackageManager(sources.packageJson);
  if (sources.pnpmLock) {
    return { command: 'pnpm install --prefer-offline', source: 'pnpm-lock.yaml' };
  }
  if (sources.npmLock) {
    return { command: 'npm ci --prefer-offline', source: 'npm lockfile' };
  }
  if (sources.yarnLock) {
    return { command: yarnInstallCommand(packageManager), source: 'yarn.lock' };
  }

  return { source: 'no supported lockfile' };
}

async function readOptionalRegularFile(filePath: string): Promise<string | undefined> {
  try {
    const stats = await lstat(filePath);
    if (!stats.isFile()) {
      return undefined;
    }
    if (stats.size > 1024 * 1024) {
      throw new Error(`${filePath} is too large to use as package-manager configuration.`);
    }
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    return (await lstat(filePath)).isFile();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function installRepositoryDependencies(
  client: SandboxBridgeClient,
  sandboxId: string,
  repositoryDirectory: string,
  nodeBinPath: string,
  requestedCommand = 'auto',
  timeoutMs = 1_200_000,
): Promise<DependencyInstallPlan> {
  const [packageJson, pnpmLock, npmPackageLock, npmShrinkwrap, yarnLock] = await Promise.all([
    readOptionalRegularFile(path.join(repositoryDirectory, 'package.json')),
    isRegularFile(path.join(repositoryDirectory, 'pnpm-lock.yaml')),
    isRegularFile(path.join(repositoryDirectory, 'package-lock.json')),
    isRegularFile(path.join(repositoryDirectory, 'npm-shrinkwrap.json')),
    isRegularFile(path.join(repositoryDirectory, 'yarn.lock')),
  ]);
  const plan = detectDependencyInstallPlan(
    {
      ...(packageJson === undefined ? {} : { packageJson }),
      pnpmLock,
      npmLock: npmPackageLock || npmShrinkwrap,
      yarnLock,
    },
    requestedCommand,
  );

  if (!plan.command) {
    process.stderr.write(`Skipped dependency installation: ${plan.source}.\n`);
    return plan;
  }

  process.stderr.write(
    `Installing sandbox dependencies with ${JSON.stringify(plan.command)} from ${plan.source} ` +
      `(timeout ${timeoutMs}ms).\n`,
  );
  const result = await client.exec(
    sandboxId,
    ['bash', '-lc', createRepositoryCommand(`set -euo pipefail\n${plan.command}`, nodeBinPath)],
    { timeoutMs, maxOutputChars: 1024 * 1024 },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.exitCode !== 0 || result.stdoutTruncated || result.stderrTruncated) {
    throw new Error(
      `Dependency installation failed with exit code ${result.exitCode}` +
        `${result.stdoutTruncated || result.stderrTruncated ? ' and truncated output' : ''}.`,
    );
  }

  const status = await client.exec(
    sandboxId,
    ['git', 'status', '--porcelain=v1', '--untracked-files=all'],
    { timeoutMs: 120_000, maxOutputChars: 1024 * 1024 },
  );
  if (status.exitCode !== 0 || status.stdoutTruncated || status.stderrTruncated) {
    throw new Error(
      `Could not verify the repository after dependency installation: ${status.stderr}`,
    );
  }
  if (status.stdout.trim()) {
    throw new Error(
      `Dependency installation changed the sandbox baseline:\n${status.stdout.trim()}\n` +
        'Use an immutable install command or disable automatic installation.',
    );
  }

  process.stderr.write('Sandbox dependency installation completed without source changes.\n');
  return plan;
}
