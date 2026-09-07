import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  RunnerNetwork,
  blockedRunnerDestinations,
  inspectRunnerNetwork,
  type NetworkCommand,
} from '../src/runner-network.js';

describe('runner runtime installer', () => {
  it('pins the full gVisor distribution and configures a named systrap runtime', () => {
    const installer = readFileSync(new URL('../runner/install-runsc.sh', import.meta.url), 'utf8');
    assert.ok(installer.includes("runsc_release='release-20260831.0'"));
    assert.ok(
      installer.includes(
        "runsc_sha256='014b3871a5c698c802fd7a03758e0dbf4c1683f9e3f8c743979ea66bbf6553a4'",
      ),
    );
    assert.ok(installer.includes('sha256sum --check --strict'));
    assert.ok(installer.includes('https://github.com/google/gvisor/releases/download/'));
    assert.ok(installer.includes("path: '/usr/local/lib/claude-triage-runner/runsc'"));
    assert.ok(installer.includes("runtimeArgs: ['--platform=systrap']"));
    assert.ok(installer.includes('...config.runtimes'));
    assert.ok(installer.includes('${RUNNER_ENVIRONMENT:-}'));
    assert.ok(installer.includes('${VERSION_ID:-}'));
    assert.ok(installer.indexOf('sha256sum --check') < installer.indexOf('sudo -n tar --extract'));
    assert.ok(
      installer.indexOf('docker ps --quiet') < installer.indexOf('systemctl restart docker'),
    );
    assert.doesNotMatch(installer, /config\[['"]default-runtime['"]\]\s*=/);
  });
});

function harness(fail?: (command: string, args: string[]) => boolean) {
  const calls: { command: string; args: string[] }[] = [];
  let name = '';
  let bridge = '';
  const run: NetworkCommand = async (command, args) => {
    calls.push({ command, args });
    if (fail?.(command, args)) throw new Error('injected command failure');
    if (command === 'docker' && args[1] === 'create') {
      name = args.at(-1)!;
      bridge = args
        .find((arg) => arg.startsWith('com.docker.network.bridge.name='))!
        .split('=')[1]!;
    }
    if (command === 'docker' && args[1] === 'inspect')
      return JSON.stringify([
        {
          Name: name,
          Driver: 'bridge',
          EnableIPv6: false,
          Internal: false,
          Options: { 'com.docker.network.bridge.name': bridge },
          IPAM: { Config: [{ Subnet: '172.22.0.0/16', Gateway: '172.22.0.1' }] },
        },
      ]);
    return '';
  };
  return { run, calls };
}

describe('RunnerNetwork', () => {
  it('installs isolation before returning and only exposes the gateway on the host', async () => {
    const { run, calls } = harness();
    const network = await RunnerNetwork.create(43210, run);
    assert.equal(network.gateway, '172.22.0.1');
    assert.match(network.name, /^claude-runner-[a-f0-9]{12}$/);
    assert.deepEqual(calls[0], {
      command: 'sudo',
      args: ['-n', '--', 'iptables', '-w', '10', '-S', 'DOCKER-USER'],
    });
    const rules = calls
      .filter((call) => call.command === 'sudo' && call.args[2] === 'iptables')
      .map((call) => call.args.slice(5));
    const ipv6Rules = calls
      .filter((call) => call.command === 'sudo' && call.args[2] === 'ip6tables')
      .map((call) => call.args.slice(5));
    assert.deepEqual(ipv6Rules[0], ['-S', 'INPUT']);
    assert.deepEqual(
      ipv6Rules.slice(1).map((rule) => rule.slice(0, 3)),
      [
        ['-I', 'INPUT', '1'],
        ['-I', 'FORWARD', '1'],
      ],
    );
    for (const rule of ipv6Rules.slice(1)) {
      assert.deepEqual(rule.slice(-2), ['-j', 'DROP']);
      assert.ok(rule.includes(network.name));
      assert.match(rule[4]!, /^cr[a-f0-9]{12}$/);
    }
    const inputRules = rules.filter((rule) => rule[0] === '-A' && rule[1]!.startsWith('CRIN'));
    assert.deepEqual(
      inputRules.map((rule) => rule.slice(2)),
      [
        ['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'ACCEPT'],
        ['-d', '172.22.0.1', '-p', 'tcp', '--dport', '43210', '-j', 'ACCEPT'],
        ['-j', 'DROP'],
      ],
    );
    const forwardRules = rules.filter((rule) => rule[0] === '-A' && rule[1]!.startsWith('CRFW'));
    assert.deepEqual(
      forwardRules.map((rule) => rule.slice(2)),
      [
        ...blockedRunnerDestinations.map((destination) => ['-d', destination, '-j', 'DROP']),
        ['-j', 'RETURN'],
      ],
    );
    assert.deepEqual(
      rules.slice(-2).map((rule) => rule.slice(0, 3)),
      [
        ['-I', 'INPUT', '1'],
        ['-I', 'DOCKER-USER', '1'],
      ],
    );
    const count = calls.length;
    await network.dispose();
    assert.deepEqual(calls[count], { command: 'docker', args: ['network', 'rm', network.name] });
    const cleanup = calls.slice(count + 1).map((call) => call.args.slice(5));
    assert.deepEqual(
      cleanup.map((rule) => rule[0]),
      ['-D', '-D', '-D', '-D', '-F', '-X', '-F', '-X'],
    );
    assert.equal(cleanup[0]![1], 'FORWARD');
    assert.equal(cleanup[2]![1], 'DOCKER-USER');
    await network.dispose();
    assert.equal(calls.length, count + 9);
  });

  it('fails closed when Docker does not provide DOCKER-USER', async () => {
    const { run, calls } = harness((_command, args) => args.includes('-S'));
    await assert.rejects(RunnerNetwork.create(1234, run), /injected/);
    assert.equal(calls.length, 1);
  });

  it('removes partial setup when the final forwarding hook fails', async () => {
    const { run, calls } = harness(
      (_command, args) => args.includes('-I') && args.includes('DOCKER-USER'),
    );
    await assert.rejects(RunnerNetwork.create(1234, run), /injected/);
    const cleanupStart = calls.findIndex(
      (call) => call.command === 'docker' && call.args[1] === 'rm',
    );
    assert.ok(cleanupStart > 0);
    assert.deepEqual(
      calls.slice(cleanupStart + 1).map((call) => call.args[5]),
      ['-D', '-F', '-X', '-F', '-X'],
    );
  });

  it('fails closed without ip6tables before creating a network', async () => {
    const { run, calls } = harness((_command, args) => args.includes('ip6tables'));
    await assert.rejects(RunnerNetwork.create(1234, run), /injected/);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((call) => call.command === 'sudo'));
  });

  it('cleans up IPv4 and partial IPv6 policy if the final IPv6 hook fails', async () => {
    const { run, calls } = harness(
      (_command, args) =>
        args.includes('ip6tables') && args.includes('-I') && args.includes('FORWARD'),
    );
    await assert.rejects(RunnerNetwork.create(1234, run), /injected/);
    const cleanupStart = calls.findIndex(
      (call) => call.command === 'docker' && call.args[1] === 'rm',
    );
    const cleanup = calls.slice(cleanupStart + 1);
    assert.equal(cleanup[0]!.args[2], 'ip6tables');
    assert.deepEqual(
      cleanup.map((call) => call.args[5]),
      ['-D', '-D', '-D', '-F', '-X', '-F', '-X'],
    );
  });

  it('attempts removal when Docker creates a network but its client fails', async () => {
    const { run, calls } = harness((command, args) => command === 'docker' && args[1] === 'create');
    await assert.rejects(RunnerNetwork.create(1234, run), /injected/);
    assert.equal(calls.at(-1)!.args[1], 'rm');
  });

  it('only tolerates an exact missing-network inspection failure during cleanup', async () => {
    const { run } = harness();
    let removing = false;
    const wrapped: NetworkCommand = async (command, args) => {
      if (command === 'docker' && args[1] === 'rm') {
        removing = true;
        throw new Error('removal failed');
      }
      if (removing && command === 'docker' && args[1] === 'inspect') {
        throw Object.assign(new Error('absent'), {
          stderr: `Error: No such network: ${args[2]}\n`,
        });
      }
      return run(command, args);
    };
    const network = await RunnerNetwork.create(1234, wrapped);
    await network.dispose();
  });

  it('retains isolation if a container still uses the network and supports retry', async () => {
    let refuseRemoval = true;
    const { run, calls } = harness(
      (command, args) => refuseRemoval && command === 'docker' && args[1] === 'rm',
    );
    const network = await RunnerNetwork.create(1234, run);
    const count = calls.length;
    await assert.rejects(network.dispose(), /injected/);
    assert.equal(calls.length, count + 2);
    refuseRemoval = false;
    await network.dispose();
    assert.equal(calls.length, count + 11);
  });

  it('retains firewall rules when absence cannot be established for this exact network', async () => {
    const { run, calls } = harness();
    let removing = false;
    const wrapped: NetworkCommand = async (command, args) => {
      if (command === 'docker' && args[1] === 'rm') {
        removing = true;
        throw new Error('removal failed');
      }
      if (removing && command === 'docker' && args[1] === 'inspect') {
        throw Object.assign(new Error('unknown'), {
          stderr: 'Error: No such network: another-network\n',
        });
      }
      return run(command, args);
    };
    const network = await RunnerNetwork.create(1234, wrapped);
    const count = calls.length;
    await assert.rejects(network.dispose(), /removal failed/);
    assert.equal(calls.length, count);
  });

  it('rejects invalid ports before invoking Docker or sudo', async () => {
    const { run, calls } = harness();
    for (const port of [0, -1, 65536, 1.5, NaN])
      await assert.rejects(RunnerNetwork.create(port, run), /Invalid/);
    assert.equal(calls.length, 0);
  });
});

describe('inspectRunnerNetwork', () => {
  const network = {
    Name: 'test',
    Driver: 'bridge',
    EnableIPv6: false,
    Internal: false,
    Options: { 'com.docker.network.bridge.name': 'cr123' },
    IPAM: { Config: [{ Subnet: '172.22.0.0/16', Gateway: '172.22.0.1' }] },
  };
  it('rejects unexpected identities, IPv6 and malformed addressing', () => {
    for (const changed of [
      { Name: 'other' },
      { Driver: 'host' },
      { EnableIPv6: true },
      { IPAM: { Config: [{ Subnet: '172.22.0.0/16', Gateway: '127.0.0.1' }] } },
      { IPAM: { Config: [{ Subnet: '172.22.0.0/16', Gateway: '172.22.0.0' }] } },
      { IPAM: { Config: [{ Subnet: '172.22.0.1/16', Gateway: '172.22.0.2' }] } },
      { IPAM: { Config: [{ Subnet: '172.22.0.0/16', Gateway: '172.22.0.1; whoami' }] } },
    ])
      assert.throws(() =>
        inspectRunnerNetwork(JSON.stringify([{ ...network, ...changed }]), 'test', 'cr123'),
      );
  });
});
