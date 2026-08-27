import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectDependencyInstallPlan } from '../src/dependency-install.js';

describe('detectDependencyInstallPlan', () => {
  it('selects pnpm from the repository lockfile', () => {
    assert.deepEqual(detectDependencyInstallPlan({ pnpmLock: true }), {
      command: 'pnpm install --prefer-offline',
      source: 'pnpm-lock.yaml',
    });
  });

  it('selects immutable npm installation from either npm lockfile', () => {
    assert.deepEqual(detectDependencyInstallPlan({ npmLock: true }), {
      command: 'npm ci --prefer-offline',
      source: 'npm lockfile',
    });
  });

  it('uses the Yarn generation declared by packageManager', () => {
    assert.deepEqual(
      detectDependencyInstallPlan({
        packageJson: JSON.stringify({ packageManager: 'yarn@4.10.3' }),
        yarnLock: true,
      }),
      { command: 'yarn install --immutable', source: 'yarn.lock' },
    );
    assert.deepEqual(
      detectDependencyInstallPlan({
        packageJson: JSON.stringify({ packageManager: 'yarn@1.22.22' }),
        yarnLock: true,
      }),
      { command: 'yarn install --frozen-lockfile', source: 'yarn.lock' },
    );
  });

  it('does not guess when no supported lockfile exists', () => {
    assert.deepEqual(detectDependencyInstallPlan({ packageJson: '{}' }), {
      source: 'no supported lockfile',
    });
  });

  it('supports explicit and disabled action inputs', () => {
    assert.deepEqual(detectDependencyInstallPlan({}, 'pnpm bootstrap'), {
      command: 'pnpm bootstrap',
      source: 'action input',
    });
    assert.deepEqual(detectDependencyInstallPlan({}, 'none'), {
      source: 'disabled by action input',
    });
  });
});
