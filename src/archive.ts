import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdtemp, open, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_ARCHIVE_PART_BYTES = 16 * 1024 * 1024;

export interface TrackedFile {
  name: string;
}

export interface RepositoryArchive {
  path: string;
  byteLength: number;
  fileCount: number;
  partBytes: number;
  partCount: number;
  sha256: string;
  dispose: () => Promise<void>;
}

export interface ArchivePart {
  bytes: Uint8Array;
  index: number;
}

function exclusionPathspec(pattern: string): string {
  if (
    !pattern ||
    pattern.includes('\0') ||
    pattern.startsWith('/') ||
    pattern.startsWith(':') ||
    pattern.split('/').includes('..')
  ) {
    throw new Error(
      `Snapshot exclusion must be a non-empty repository-relative Git pathspec: ${JSON.stringify(pattern)}.`,
    );
  }
  return `:(exclude)${pattern}`;
}

async function trackedFiles(
  repositoryDirectory: string,
  excludedPathspecs: string[],
): Promise<TrackedFile[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['ls-files', '-z', '--', '.', ...excludedPathspecs.map(exclusionPathspec)],
    {
      cwd: repositoryDirectory,
      encoding: 'buffer',
      maxBuffer: 128 * 1024 * 1024,
    },
  );

  const names = stdout
    .toString('utf8')
    .split('\0')
    .filter((name) => name.length > 0);
  return Promise.all(
    names.map(async (name) => {
      const metadata = await lstat(path.join(repositoryDirectory, name));
      if (metadata.isDirectory()) {
        throw new Error(
          `Tracked path ${JSON.stringify(name)} is a directory. Git submodules are not supported yet.`,
        );
      }
      return { name };
    }),
  );
}

async function createTar(
  archiveSourceDirectory: string,
  destination: string,
  files: TrackedFile[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tarProcess = spawn(
      'tar',
      ['--gzip', '--null', '--no-recursion', '--create', '--file', destination, '--files-from=-'],
      { cwd: archiveSourceDirectory, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    tarProcess.once('error', reject);
    tarProcess.once('exit', (exitCode) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${exitCode ?? 'unknown'}.`));
      }
    });
    tarProcess.stdin.end(`${files.map((file) => `repo/${file.name}`).join('\0')}\0`);
  });
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export async function createRepositoryArchive(
  repositoryDirectory: string,
  partBytes = DEFAULT_ARCHIVE_PART_BYTES,
  excludedPathspecs: string[] = [],
): Promise<RepositoryArchive> {
  if (!Number.isSafeInteger(partBytes) || partBytes <= 0) {
    throw new Error('Archive part size must be a positive safe integer.');
  }

  const files = await trackedFiles(repositoryDirectory, excludedPathspecs);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-archive-'));
  const archivePath = path.join(temporaryDirectory, 'repository.tar.gz');

  try {
    await symlink(repositoryDirectory, path.join(temporaryDirectory, 'repo'), 'dir');
    await createTar(temporaryDirectory, archivePath, files);
    const archiveStats = await stat(archivePath);
    return {
      path: archivePath,
      byteLength: archiveStats.size,
      fileCount: files.length,
      partBytes,
      partCount: Math.ceil(archiveStats.size / partBytes),
      sha256: await sha256File(archivePath),
      dispose: async () => {
        await rm(temporaryDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function* readArchiveParts(
  archivePath: string,
  partBytes = DEFAULT_ARCHIVE_PART_BYTES,
): AsyncGenerator<ArchivePart> {
  if (!Number.isSafeInteger(partBytes) || partBytes <= 0) {
    throw new Error('Archive part size must be a positive safe integer.');
  }

  const archive = await open(archivePath, 'r');
  let index = 0;
  try {
    while (true) {
      const buffer = Buffer.allocUnsafe(partBytes);
      const { bytesRead } = await archive.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      yield { bytes: buffer.subarray(0, bytesRead), index };
      index += 1;
    }
  } finally {
    await archive.close();
  }
}
