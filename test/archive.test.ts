import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createRepositoryArchive, readArchiveParts } from '../src/archive.js';

const execFileAsync = promisify(execFile);

describe('readArchiveParts', () => {
  it('splits an archive into fixed-size byte ranges', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-parts-'));

    try {
      const archivePath = path.join(temporaryDirectory, 'archive.bin');
      await writeFile(archivePath, '0123456789');
      const parts: Buffer[] = [];
      for await (const part of readArchiveParts(archivePath, 4)) {
        assert.equal(part.index, parts.length);
        parts.push(Buffer.from(part.bytes));
      }

      assert.deepEqual(
        parts.map((part) => part.toString()),
        ['0123', '4567', '89'],
      );
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

describe('createRepositoryArchive', () => {
  it('archives tracked files from a Git repository', async () => {
    const repositoryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-repository-'));

    try {
      await mkdir(path.join(repositoryDirectory, 'src'));
      await writeFile(path.join(repositoryDirectory, 'src', 'file with spaces.ts'), 'export {};\n');
      await execFileAsync('git', ['init'], { cwd: repositoryDirectory });
      await execFileAsync('git', ['add', '.'], { cwd: repositoryDirectory });

      const archive = await createRepositoryArchive(repositoryDirectory, 16);
      try {
        assert.equal(archive.fileCount, 1);
        assert.equal(archive.partCount, Math.ceil(archive.byteLength / 16));
        assert.match(archive.sha256, /^[a-f0-9]{64}$/);

        const parts: Buffer[] = [];
        for await (const part of readArchiveParts(archive.path, archive.partBytes)) {
          parts.push(Buffer.from(part.bytes));
        }
        const reconstructed = Buffer.concat(parts);
        assert.equal(createHash('sha256').update(reconstructed).digest('hex'), archive.sha256);
        const reconstructedPath = path.join(repositoryDirectory, 'archive.tar.gz');
        await writeFile(reconstructedPath, reconstructed);
        const { stdout } = await execFileAsync('tar', ['--list', '--file', reconstructedPath]);
        assert.equal(stdout.trim(), 'repo/src/file with spaces.ts');
      } finally {
        await archive.dispose();
      }
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

      const archive = await createRepositoryArchive(repositoryDirectory);
      try {
        assert.equal(archive.partBytes, 16 * 1024 * 1024);
        assert.ok(archive.byteLength < Buffer.byteLength(content) / 10);
      } finally {
        await archive.dispose();
      }
    } finally {
      await rm(repositoryDirectory, { recursive: true, force: true });
    }
  });

  it('excludes tracked directories and files matching Git pathspecs', async () => {
    const repositoryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-repository-'));

    try {
      await mkdir(path.join(repositoryDirectory, 'docs', 'public'), { recursive: true });
      await mkdir(path.join(repositoryDirectory, 'src'));
      await writeFile(path.join(repositoryDirectory, 'docs', 'public', 'asset.png'), 'asset');
      await writeFile(path.join(repositoryDirectory, 'docs', 'guide.md'), 'guide');
      await writeFile(path.join(repositoryDirectory, 'src', 'index.ts'), 'export {};\n');
      await execFileAsync('git', ['init'], { cwd: repositoryDirectory });
      await execFileAsync('git', ['add', '.'], { cwd: repositoryDirectory });

      const archive = await createRepositoryArchive(repositoryDirectory, 1024, [
        'docs/public',
        'docs/*.md',
      ]);
      try {
        assert.equal(archive.fileCount, 1);
        const { stdout } = await execFileAsync('tar', ['--list', '--file', archive.path]);
        assert.equal(stdout.trim(), 'repo/src/index.ts');
      } finally {
        await archive.dispose();
      }
    } finally {
      await rm(repositoryDirectory, { recursive: true, force: true });
    }
  });
});
