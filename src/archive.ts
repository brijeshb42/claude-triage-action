import { execFile, spawn } from 'node:child_process';
import { lstat, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TARGET_CHUNK_BYTES = 20 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;

export interface TrackedFile {
  name: string;
  size: number;
}

function estimatedTarBytes(file: TrackedFile): number {
  const contentBlocks = Math.ceil(file.size / 512) * 512;
  return contentBlocks + 1_536;
}

export function planArchiveChunks(
  files: TrackedFile[],
  targetBytes = TARGET_CHUNK_BYTES,
): TrackedFile[][] {
  const chunks: TrackedFile[][] = [];
  let current: TrackedFile[] = [];
  let currentBytes = 1_024;

  for (const file of files) {
    const estimate = estimatedTarBytes(file);
    if (estimate > MAX_ARCHIVE_BYTES) {
      throw new Error(
        `Tracked file ${JSON.stringify(file.name)} is too large for Bridge hydration ` +
          `(${file.size} bytes).`,
      );
    }

    if (current.length > 0 && currentBytes + estimate > targetBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 1_024;
    }

    current.push(file);
    currentBytes += estimate;
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

async function trackedFiles(repositoryDirectory: string): Promise<TrackedFile[]> {
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: repositoryDirectory,
    encoding: 'buffer',
    maxBuffer: 128 * 1024 * 1024,
  });

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
      return { name, size: metadata.size };
    }),
  );
}

async function createTar(
  repositoryDirectory: string,
  destination: string,
  files: TrackedFile[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tarProcess = spawn(
      'tar',
      [
        '--null',
        '--files-from=-',
        '--no-recursion',
        '--transform=flags=r;s,^,repo/,',
        '--create',
        '--file',
        destination,
      ],
      { cwd: repositoryDirectory, stdio: ['pipe', 'inherit', 'inherit'] },
    );
    tarProcess.once('error', reject);
    tarProcess.once('exit', (exitCode) => {
      if (exitCode === 0) {
        resolve();
      } else {
        reject(new Error(`tar exited with code ${exitCode ?? 'unknown'}.`));
      }
    });
    tarProcess.stdin.end(`${files.map((file) => file.name).join('\0')}\0`);
  });
}

export interface ArchiveChunk {
  bytes: Uint8Array;
  fileCount: number;
}

export async function createArchiveChunks(repositoryDirectory: string): Promise<ArchiveChunk[]> {
  const files = await trackedFiles(repositoryDirectory);
  const plans = planArchiveChunks(files);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-archives-'));

  try {
    const chunks: ArchiveChunk[] = [];
    for (const [index, plannedFiles] of plans.entries()) {
      const archivePath = path.join(temporaryDirectory, `chunk-${index}.tar`);
      await createTar(repositoryDirectory, archivePath, plannedFiles);
      const archiveStats = await stat(archivePath);
      if (archiveStats.size > MAX_ARCHIVE_BYTES) {
        throw new Error(
          `Archive chunk ${index + 1} exceeded the Bridge limit (${archiveStats.size} bytes).`,
        );
      }
      chunks.push({ bytes: await readFile(archivePath), fileCount: plannedFiles.length });
    }
    return chunks;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
