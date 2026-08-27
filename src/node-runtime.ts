import { lstat, readFile } from 'node:fs/promises';
import * as path from 'node:path';
import compare from 'semver/functions/compare.js';
import satisfies from 'semver/functions/satisfies.js';
import validRange from 'semver/ranges/valid.js';
import type { SandboxBridgeClient } from './bridge-client.js';
import { assertNodeBinPath } from './node-command.js';

const DEFAULT_NODE_VERSION = '22.23.2';
const NODE_DOWNLOAD_ROOT = 'https://nodejs.org/download/release';
const NODE_RELEASE_INDEX_URL = 'https://nodejs.org/dist/index.json';
const TOOLCHAIN_ROOT = '/workspace/.claude-triage/node';

export interface NodeRequirementSources {
  packageJson?: string;
  nodeVersionFile?: string;
  nvmrc?: string;
}

export interface NodeRequirement {
  range: string;
  source: string;
}

interface PublishedNodeRelease {
  version: string;
  files?: string[];
}

export interface SelectedNodeRelease {
  version: string;
  archiveName: string;
}

export interface PreparedNodeRuntime extends SelectedNodeRelease {
  binPath: string;
  requirement: NodeRequirement;
}

function nonEmptyVersion(value: string | undefined): string | undefined {
  const firstLine = value
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.replace(/^v(?=\d)/, '');
}

function parsePackageJson(packageJson: string | undefined): {
  enginesNode?: string;
  voltaNode?: string;
} {
  if (!packageJson) {
    return {};
  }

  const value: unknown = JSON.parse(packageJson);
  if (typeof value !== 'object' || value === null) {
    throw new Error('The root package.json must contain a JSON object.');
  }

  const engines = 'engines' in value ? value.engines : undefined;
  const volta = 'volta' in value ? value.volta : undefined;
  const enginesNode =
    typeof engines === 'object' &&
    engines !== null &&
    'node' in engines &&
    typeof engines.node === 'string'
      ? engines.node.trim()
      : undefined;
  const voltaNode =
    typeof volta === 'object' && volta !== null && 'node' in volta && typeof volta.node === 'string'
      ? volta.node.trim()
      : undefined;

  return {
    ...(enginesNode ? { enginesNode } : {}),
    ...(voltaNode ? { voltaNode } : {}),
  };
}

export function detectNodeRequirement(
  sources: NodeRequirementSources,
  requestedVersion = 'auto',
): NodeRequirement {
  const normalizedRequestedVersion = requestedVersion.trim();
  if (normalizedRequestedVersion !== 'auto') {
    return { range: normalizedRequestedVersion, source: 'action input' };
  }

  const packageConfiguration = parsePackageJson(sources.packageJson);
  if (packageConfiguration.enginesNode) {
    return { range: packageConfiguration.enginesNode, source: 'package.json#engines.node' };
  }

  const nodeVersion = nonEmptyVersion(sources.nodeVersionFile);
  if (nodeVersion) {
    return { range: nodeVersion, source: '.node-version' };
  }

  const nvmrc = nonEmptyVersion(sources.nvmrc);
  if (nvmrc) {
    return { range: nvmrc, source: '.nvmrc' };
  }

  if (packageConfiguration.voltaNode) {
    return { range: packageConfiguration.voltaNode, source: 'package.json#volta.node' };
  }

  return { range: DEFAULT_NODE_VERSION, source: 'sandbox image fallback' };
}

function isPublishedNodeRelease(value: unknown): value is PublishedNodeRelease {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    (!('files' in value) ||
      (Array.isArray(value.files) && value.files.every((entry) => typeof entry === 'string')))
  );
}

export function selectMinimumPublishedNodeRelease(
  range: string,
  releases: PublishedNodeRelease[],
): SelectedNodeRelease {
  if (!range || range.length > 200 || !validRange(range)) {
    throw new Error(`Invalid Node.js version range: ${JSON.stringify(range)}.`);
  }

  const matchingVersions = releases
    .filter((release) => release.files?.includes('linux-x64'))
    .map((release) => release.version.replace(/^v/, ''))
    .filter((version) => satisfies(version, range))
    .sort(compare);
  const version = matchingVersions[0];

  if (!version) {
    throw new Error(`No published linux-x64 Node.js release satisfies ${JSON.stringify(range)}.`);
  }

  return { version, archiveName: `node-v${version}-linux-x64.tar.xz` };
}

export function findNodeArchiveChecksum(manifest: string, archiveName: string): string {
  for (const line of manifest.split(/\r?\n/)) {
    const [checksum, filename, extra] = line.trim().split(/\s+/);
    if (
      filename === archiveName &&
      extra === undefined &&
      checksum !== undefined &&
      /^[a-f0-9]{64}$/.test(checksum)
    ) {
      return checksum;
    }
  }

  throw new Error(`Node.js checksum manifest does not contain ${archiveName}.`);
}

async function readOptionalRegularFile(filePath: string): Promise<string | undefined> {
  try {
    const stats = await lstat(filePath);
    if (!stats.isFile()) {
      return undefined;
    }
    if (stats.size > 1024 * 1024) {
      throw new Error(`${filePath} is too large to use as Node.js configuration.`);
    }
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': 'claude-triage-action' } });
  if (!response.ok) {
    throw new Error(`Could not fetch ${url}: HTTP ${response.status}.`);
  }
  return response.text();
}

async function resolveNodeRelease(requirement: NodeRequirement): Promise<SelectedNodeRelease> {
  const indexValue: unknown = JSON.parse(await fetchText(NODE_RELEASE_INDEX_URL));
  if (!Array.isArray(indexValue) || !indexValue.every(isPublishedNodeRelease)) {
    throw new Error('Node.js returned an invalid release index.');
  }
  return selectMinimumPublishedNodeRelease(requirement.range, indexValue);
}

async function installNodeRelease(
  client: SandboxBridgeClient,
  sandboxId: string,
  release: SelectedNodeRelease,
): Promise<string> {
  const systemVersion = await client.exec(sandboxId, ['/usr/local/bin/node', '--version']);
  if (systemVersion.exitCode === 0 && systemVersion.stdout.trim() === `v${release.version}`) {
    return '/usr/local/bin';
  }

  const installDirectory = `${TOOLCHAIN_ROOT}/v${release.version}`;
  const nodeBinPath = `${installDirectory}/bin`;
  assertNodeBinPath(nodeBinPath);

  const manifest = await fetchText(`${NODE_DOWNLOAD_ROOT}/v${release.version}/SHASUMS256.txt`);
  const expectedChecksum = findNodeArchiveChecksum(manifest, release.archiveName);
  const archivePath = `/workspace/.claude-triage/${release.archiveName}`;
  const downloadUrl = `${NODE_DOWNLOAD_ROOT}/v${release.version}/${release.archiveName}`;

  const commands: Array<{ argv: string[]; timeoutMs?: number }> = [
    { argv: ['mkdir', '-p', installDirectory] },
    {
      argv: [
        'curl',
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        downloadUrl,
        '--output',
        archivePath,
      ],
      timeoutMs: 300_000,
    },
  ];

  for (const command of commands) {
    const result = await client.exec(sandboxId, command.argv, {
      cwd: '/workspace',
      timeoutMs: command.timeoutMs ?? 120_000,
    });
    if (result.exitCode !== 0) {
      throw new Error(`Could not prepare Node.js ${release.version}: ${result.stderr}`);
    }
  }

  const checksumResult = await client.exec(sandboxId, ['sha256sum', archivePath], {
    cwd: '/workspace',
  });
  const actualChecksum = checksumResult.stdout.trim().split(/\s+/)[0];
  if (checksumResult.exitCode !== 0 || actualChecksum !== expectedChecksum) {
    await client.exec(sandboxId, ['rm', '-f', archivePath], { cwd: '/workspace' });
    throw new Error(`Checksum verification failed for Node.js ${release.version}.`);
  }

  const extractResult = await client.exec(
    sandboxId,
    [
      'tar',
      '--extract',
      '--file',
      archivePath,
      '--directory',
      installDirectory,
      '--strip-components=1',
    ],
    { cwd: '/workspace', timeoutMs: 300_000 },
  );
  await client.exec(sandboxId, ['rm', '-f', archivePath], { cwd: '/workspace' });
  if (extractResult.exitCode !== 0) {
    throw new Error(`Could not extract Node.js ${release.version}: ${extractResult.stderr}`);
  }

  const verifyResult = await client.exec(sandboxId, [`${nodeBinPath}/node`, '--version']);
  if (verifyResult.exitCode !== 0 || verifyResult.stdout.trim() !== `v${release.version}`) {
    throw new Error(`Installed Node.js ${release.version} did not pass verification.`);
  }

  return nodeBinPath;
}

export async function prepareNodeRuntime(
  client: SandboxBridgeClient,
  sandboxId: string,
  repositoryDirectory: string,
  requestedVersion = 'auto',
): Promise<PreparedNodeRuntime> {
  const sources = await Promise.all([
    readOptionalRegularFile(path.join(repositoryDirectory, 'package.json')),
    readOptionalRegularFile(path.join(repositoryDirectory, '.node-version')),
    readOptionalRegularFile(path.join(repositoryDirectory, '.nvmrc')),
  ]);
  const requirement = detectNodeRequirement(
    {
      ...(sources[0] === undefined ? {} : { packageJson: sources[0] }),
      ...(sources[1] === undefined ? {} : { nodeVersionFile: sources[1] }),
      ...(sources[2] === undefined ? {} : { nvmrc: sources[2] }),
    },
    requestedVersion,
  );
  const release = await resolveNodeRelease(requirement);
  const binPath = await installNodeRelease(client, sandboxId, release);
  return { ...release, binPath, requirement };
}
