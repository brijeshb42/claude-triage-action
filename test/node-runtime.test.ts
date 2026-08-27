import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createRepositoryCommand } from '../src/node-command.js';
import {
  detectNodeRequirement,
  findNodeArchiveChecksum,
  selectMinimumPublishedNodeRelease,
} from '../src/node-runtime.js';

describe('detectNodeRequirement', () => {
  it('prefers the minimum supported engines.node range over development pins', () => {
    assert.deepEqual(
      detectNodeRequirement({
        packageJson: JSON.stringify({
          engines: { node: '>=22.23.2' },
          volta: { node: '24.8.0' },
        }),
        nodeVersionFile: '24.8.0\n',
        nvmrc: 'v24.8.0\n',
      }),
      { range: '>=22.23.2', source: 'package.json#engines.node' },
    );
  });

  it('uses exact repository pins when engines.node is absent', () => {
    assert.deepEqual(
      detectNodeRequirement({
        packageJson: JSON.stringify({ volta: { node: '22.22.0' } }),
        nodeVersionFile: '22.23.0\n',
        nvmrc: 'v22.24.0\n',
      }),
      { range: '22.23.0', source: '.node-version' },
    );
  });

  it('uses an explicit action input before repository configuration', () => {
    assert.deepEqual(
      detectNodeRequirement(
        { packageJson: JSON.stringify({ engines: { node: '>=22.23.2' } }) },
        '24.x',
      ),
      { range: '24.x', source: 'action input' },
    );
  });

  it('accepts whitespace around the auto action input', () => {
    assert.deepEqual(
      detectNodeRequirement(
        { packageJson: JSON.stringify({ engines: { node: '>=22.23.2' } }) },
        ' auto ',
      ),
      { range: '>=22.23.2', source: 'package.json#engines.node' },
    );
  });
});

describe('selectMinimumPublishedNodeRelease', () => {
  const releases = [
    { version: 'v22.23.1', files: ['linux-x64'] },
    { version: 'v22.23.3', files: ['linux-x64'] },
    { version: 'v22.23.2', files: ['linux-arm64'] },
    { version: 'v24.0.0', files: ['linux-x64'] },
    { version: 'v20.19.0', files: ['linux-x64'] },
  ];

  it('selects the oldest published linux-x64 release satisfying the range', () => {
    assert.deepEqual(selectMinimumPublishedNodeRelease('>=22.23.2', releases), {
      version: '22.23.3',
      archiveName: 'node-v22.23.3-linux-x64.tar.xz',
    });
  });

  it('selects the lowest branch in a union range', () => {
    assert.deepEqual(selectMinimumPublishedNodeRelease('>=20.19.0 <21 || >=22.23.2', releases), {
      version: '20.19.0',
      archiveName: 'node-v20.19.0-linux-x64.tar.xz',
    });
  });

  it('rejects ranges with no installable published release', () => {
    assert.throws(
      () => selectMinimumPublishedNodeRelease('19.x', releases),
      /No published linux-x64 Node.js release satisfies/,
    );
  });
});

describe('findNodeArchiveChecksum', () => {
  it('returns only the checksum for the requested archive', () => {
    const manifest = [
      'a'.repeat(64) + '  node-v22.23.3-linux-arm64.tar.xz',
      'b'.repeat(64) + '  node-v22.23.3-linux-x64.tar.xz',
    ].join('\n');

    assert.equal(
      findNodeArchiveChecksum(manifest, 'node-v22.23.3-linux-x64.tar.xz'),
      'b'.repeat(64),
    );
  });
});

describe('createRepositoryCommand', () => {
  it('prepends the selected Node installation without evaluating its path', () => {
    assert.equal(
      createRepositoryCommand('pnpm test --run', '/workspace/.claude-triage/node/v22.23.3/bin'),
      "export PATH='/workspace/.claude-triage/node/v22.23.3/bin':$PATH\npnpm test --run",
    );
  });

  it('rejects an unexpected Node binary directory', () => {
    assert.throws(() => createRepositoryCommand('node --version', '/tmp/node/bin'));
  });
});
