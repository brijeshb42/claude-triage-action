import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createArchiveChunks, planArchiveChunks } from '../src/archive.js';

const execFileAsync = promisify(execFile);

describe('planArchiveChunks', () => {
  it('splits repositories into bounded chunks while preserving every file', () => {
    const files = Array.from({ length: 20 }, (_, index) => ({
      name: `src/file-${index}.ts`,
      size: 1_024,
    }));
    const chunks = planArchiveChunks(files, 8_000);

    assert.ok(chunks.length > 1);
    assert.deepEqual(chunks.flat(), files);
  });

  it('rejects a single file larger than the Bridge request limit', () => {
    assert.throws(() => planArchiveChunks([{ name: 'large.bin', size: 33 * 1024 * 1024 }]));
  });
});

describe('createArchiveChunks', () => {
  it('archives tracked files from a Git repository', async () => {
    const repositoryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-repository-'));

    try {
      await mkdir(path.join(repositoryDirectory, 'src'));
      await writeFile(path.join(repositoryDirectory, 'src', 'file with spaces.ts'), 'export {};\n');
      await execFileAsync('git', ['init'], { cwd: repositoryDirectory });
      await execFileAsync('git', ['add', '.'], { cwd: repositoryDirectory });

      const chunks = await createArchiveChunks(repositoryDirectory);

      assert.equal(chunks.length, 1);
      const [chunk] = chunks;
      assert.ok(chunk);
      assert.equal(chunk.fileCount, 1);
      assert.ok(chunk.bytes.length > 0);

      const archivePath = path.join(repositoryDirectory, 'archive.tar.gz');
      await writeFile(archivePath, chunk.bytes);
      const { stdout } = await execFileAsync('tar', ['--list', '--file', archivePath]);
      assert.equal(stdout.trim(), 'repo/src/file with spaces.ts');
    } finally {
      await rm(repositoryDirectory, { recursive: true, force: true });
    }
  });

  it('compresses repetitive repository content before uploading it', async () => {
    const repositoryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-repository-'));

    try {
      const content = 'export const value = 42;\n'.repeat(50_000);
      await writeFile(path.join(repositoryDirectory, 'large.ts'), content);
      await execFileAsync('git', ['init'], { cwd: repositoryDirectory });
      await execFileAsync('git', ['add', '.'], { cwd: repositoryDirectory });

      const [chunk] = await createArchiveChunks(repositoryDirectory);

      assert.ok(chunk);
      assert.ok(chunk.bytes.length < Buffer.byteLength(content) / 10);
    } finally {
      await rm(repositoryDirectory, { recursive: true, force: true });
    }
  });
});
