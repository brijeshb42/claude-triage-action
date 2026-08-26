import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveWorkspacePath } from '../src/workspace.js';

describe('resolveWorkspacePath', () => {
  it('resolves repository-relative paths', () => {
    assert.equal(
      resolveWorkspacePath('packages/example/src/index.ts'),
      '/workspace/repo/packages/example/src/index.ts',
    );
    assert.equal(resolveWorkspacePath('.'), '/workspace/repo');
  });

  it('rejects paths outside the repository', () => {
    assert.throws(() => resolveWorkspacePath('../secret'));
    assert.throws(() => resolveWorkspacePath('/etc/passwd'));
  });
});
