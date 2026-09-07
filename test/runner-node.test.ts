import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareRunnerNode } from '../src/runner-node.js';

const releases = [
  { version: 'v22.23.2', files: ['linux-x64'] },
  { version: 'v24.0.0', files: ['linux-x64'] },
  { version: 'v24.1.0', files: ['linux-x64'] },
];
function fixture(manifest = `${'a'.repeat(64)}  node-v24.0.0-linux-x64.tar.xz`) {
  const calls: string[][] = [];
  return {
    calls,
    exec: async (args: string[]) => {
      calls.push(args);
      if (args[0] === '/usr/local/bin/node') return 'v22.23.2\n';
      if (args.at(-1)?.endsWith('index.json')) return JSON.stringify(releases);
      if (args.at(-1)?.endsWith('SHASUMS256.txt')) return manifest;
      if (args[0] === 'bash') return '';
      throw new Error('Unexpected command');
    },
  };
}

test('runner reuses image Node when it matches the selected repository version', async () => {
  const { exec, calls } = fixture();
  const runtime = await prepareRunnerNode({}, 'auto', exec);
  assert.equal(runtime.binPath, '/usr/local/bin');
  assert.equal(calls.length, 2);
});

test('runner installs minimum matching repository Node outside source with verified checksum', async () => {
  const { exec, calls } = fixture();
  const runtime = await prepareRunnerNode(
    { packageJson: '{"engines":{"node":"24.x"}}' },
    'auto',
    exec,
  );
  assert.equal(runtime.version, '24.0.0');
  assert.equal(runtime.binPath, '/workspace/.runner-node/v24.0.0/bin');
  const script = calls.at(-1)![2]!;
  assert.ok(script.indexOf('sha256sum --check --status') < script.indexOf('tar --extract'));
  assert.doesNotMatch(script, /workspace\/repo|TOKEN|ANTHROPIC/);
});

test('runner Node override wins over repository configuration', async () => {
  const { exec } = fixture();
  assert.equal((await prepareRunnerNode({ nvmrc: '24.0.0' }, '22.23.2', exec)).version, '22.23.2');
});

test('runner fails closed before extraction for missing checksum or invalid version', async () => {
  const { exec, calls } = fixture('invalid manifest');
  await assert.rejects(
    prepareRunnerNode({ nodeVersionFile: '24' }, 'auto', exec),
    /checksum manifest/,
  );
  await assert.rejects(prepareRunnerNode({}, '24; touch /tmp/unsafe', exec), /Invalid Node.js/);
  assert.equal(
    calls.some((args) => args[0] === 'bash'),
    false,
  );
});
