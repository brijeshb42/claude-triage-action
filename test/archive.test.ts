import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planArchiveChunks } from '../src/archive.js';

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
