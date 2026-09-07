import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parsePreviewConfig } from '../src/preview-config.js';

describe('parsePreviewConfig', () => {
  it('reads the preview directory and validation commands', () => {
    assert.deepEqual(
      parsePreviewConfig(
        [
          'preview:',
          '  provider: pkg-pr-new',
          '  directory: examples/triage-preview/',
          '  validation:',
          '    - pnpm --dir examples/triage-preview install --ignore-workspace --lockfile=false',
          '    - pnpm --dir examples/triage-preview --ignore-workspace build',
        ].join('\n'),
      ),
      {
        directory: 'examples/triage-preview',
        validation: [
          'pnpm --dir examples/triage-preview install --ignore-workspace --lockfile=false',
          'pnpm --dir examples/triage-preview --ignore-workspace build',
        ],
      },
    );
  });

  it('returns undefined when no preview is configured', () => {
    assert.equal(parsePreviewConfig('other: true\n'), undefined);
    assert.equal(parsePreviewConfig(''), undefined);
  });

  it('rejects directories outside the repository and malformed commands', () => {
    assert.throws(() => parsePreviewConfig('preview:\n  directory: ../escape\n'), /escapes/);
    assert.throws(() => parsePreviewConfig('preview:\n  directory: /abs\n'), /relative/);
    assert.throws(() => parsePreviewConfig('preview:\n  directory: .\n'), /repository root/);
    assert.throws(
      () => parsePreviewConfig('preview:\n  directory: x\n  validation:\n    - 1\n'),
      /non-empty string/,
    );
  });
});
