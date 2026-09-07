import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { promisify } from 'node:util';

export type NetworkCommand = (command: string, args: string[]) => Promise<string>;
const exec = promisify(execFile);
const runCommand: NetworkCommand = async (command, args) =>
  (await exec(command, args, { timeout: 30_000, maxBuffer: 1024 * 1024 })).stdout;

// IPv4 only. Independent host ip6tables rules deny all sandbox IPv6 traffic.
// Public Internet access is intentional (package registries); private networks,
// metadata services, multicast, documentation and reserved ranges are denied.
export const blockedRunnerDestinations = [
  '0.0.0.0/8',
  '10.0.0.0/8',
  '100.64.0.0/10',
  '127.0.0.0/8',
  '169.254.0.0/16',
  '172.16.0.0/12',
  '192.0.0.0/24',
  '192.0.2.0/24',
  '192.88.99.0/24',
  '192.168.0.0/16',
  '198.18.0.0/15',
  '198.51.100.0/24',
  '203.0.113.0/24',
  '224.0.0.0/4',
  '240.0.0.0/4',
] as const;

function ipv4Number(ip: string): number {
  return ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0);
}

export function inspectRunnerNetwork(raw: string, name: string, bridge: string): string {
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length !== 1)
    throw new Error('Invalid Docker network inspection');
  const network = values[0];
  if (
    !network ||
    network.Name !== name ||
    network.Driver !== 'bridge' ||
    network.EnableIPv6 !== false ||
    network.Internal !== false ||
    network.Options?.['com.docker.network.bridge.name'] !== bridge ||
    !Array.isArray(network.IPAM?.Config) ||
    network.IPAM.Config.length !== 1
  )
    throw new Error('Unexpected Docker sandbox network configuration');
  const { Gateway: gateway, Subnet: subnet } = network.IPAM.Config[0];
  if (typeof gateway !== 'string' || !isIPv4(gateway) || typeof subnet !== 'string') {
    throw new Error('Docker sandbox network must have an IPv4 gateway and subnet');
  }
  const parts = subnet.split('/');
  const prefix = Number(parts[1]);
  if (
    parts.length !== 2 ||
    !isIPv4(parts[0] ?? '') ||
    !/^\d+$/.test(parts[1] ?? '') ||
    prefix < 8 ||
    prefix > 30
  ) {
    throw new Error('Invalid Docker sandbox IPv4 subnet');
  }
  const size = 2 ** (32 - prefix);
  const base = ipv4Number(parts[0]!);
  const address = ipv4Number(gateway);
  if (base % size !== 0 || address <= base || address >= base + size - 1) {
    throw new Error('Docker sandbox gateway is outside its subnet');
  }
  return gateway;
}

/** Only for ephemeral Linux GitHub runners using Docker's iptables backend. */
export class RunnerNetwork {
  private readonly cleanup: { args: string[]; ipv6: boolean }[] = [];
  private networkExists = false;
  private constructor(
    readonly name: string,
    private readonly bridge: string,
    private readonly run: NetworkCommand,
    private gatewayValue = '',
  ) {}

  get gateway(): string {
    return this.gatewayValue;
  }

  static async create(
    gatewayPort: number,
    run: NetworkCommand = runCommand,
  ): Promise<RunnerNetwork> {
    if (!Number.isInteger(gatewayPort) || gatewayPort < 1 || gatewayPort > 65535) {
      throw new Error('Invalid credential gateway port');
    }
    const id = randomBytes(6).toString('hex');
    const network = new RunnerNetwork(`claude-runner-${id}`, `cr${id}`, run);
    try {
      await network.iptables(['-S', 'DOCKER-USER']);
      await network.iptables(['-S', 'INPUT'], true);
      network.networkExists = true;
      await run('docker', [
        'network',
        'create',
        '--driver',
        'bridge',
        '--ipv6=false',
        '--opt',
        `com.docker.network.bridge.name=${network.bridge}`,
        '--opt',
        'com.docker.network.bridge.enable_icc=false',
        network.name,
      ]);
      network.gatewayValue = inspectRunnerNetwork(
        await run('docker', ['network', 'inspect', network.name]),
        network.name,
        network.bridge,
      );
      const input = `CRIN${id}`;
      const forward = `CRFW${id}`;
      for (const chain of [input, forward]) {
        await network.iptables(['-N', chain]);
        network.cleanup.push(
          { args: ['-X', chain], ipv6: false },
          { args: ['-F', chain], ipv6: false },
        );
      }
      await network.iptables([
        '-A',
        input,
        '-m',
        'conntrack',
        '--ctstate',
        'ESTABLISHED,RELATED',
        '-j',
        'ACCEPT',
      ]);
      await network.iptables([
        '-A',
        input,
        '-d',
        network.gateway,
        '-p',
        'tcp',
        '--dport',
        String(gatewayPort),
        '-j',
        'ACCEPT',
      ]);
      await network.iptables(['-A', input, '-j', 'DROP']);
      // Denials precede any established-connection shortcut or Docker rules.
      for (const destination of blockedRunnerDestinations) {
        await network.iptables(['-A', forward, '-d', destination, '-j', 'DROP']);
      }
      await network.iptables(['-A', forward, '-j', 'RETURN']);
      for (const [parent, child] of [
        ['INPUT', input],
        ['DOCKER-USER', forward],
      ]) {
        const match = ['-i', network.bridge, '-j', child!];
        await network.iptables(['-I', parent!, '1', ...match]);
        network.cleanup.push({ args: ['-D', parent!, ...match], ipv6: false });
      }
      // gVisor does not expose Linux's disable_ipv6 sysctls. Enforce this at
      // the host independently of both its netstack and Docker's IPv6 setting.
      for (const parent of ['INPUT', 'FORWARD']) {
        const match = [
          '-i',
          network.bridge,
          '-m',
          'comment',
          '--comment',
          network.name,
          '-j',
          'DROP',
        ];
        await network.iptables(['-I', parent, '1', ...match], true);
        network.cleanup.push({ args: ['-D', parent, ...match], ipv6: true });
      }
      return network;
    } catch (error) {
      try {
        await network.dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Sandbox network setup and cleanup failed');
      }
      throw error;
    }
  }

  private async iptables(args: string[], ipv6 = false): Promise<void> {
    await this.run('sudo', ['-n', '--', ipv6 ? 'ip6tables' : 'iptables', '-w', '10', ...args]);
  }

  async dispose(): Promise<void> {
    // Remove containers first. If any remain, Docker refuses network removal and
    // we deliberately retain the firewall. Never expose a live sandbox on cleanup.
    if (this.networkExists) {
      try {
        await this.run('docker', ['network', 'rm', this.name]);
      } catch (error) {
        let absent = false;
        try {
          await this.run('docker', ['network', 'inspect', this.name]);
        } catch (inspectionError) {
          const stderr = (inspectionError as { stderr?: unknown })?.stderr;
          absent =
            typeof stderr === 'string' &&
            [
              `Error response from daemon: network ${this.name} not found`,
              `Error: No such network: ${this.name}`,
            ].includes(stderr.trim());
        }
        if (!absent) throw error;
      }
      this.networkExists = false;
    }
    while (this.cleanup.length > 0) {
      const cleanup = this.cleanup[this.cleanup.length - 1]!;
      await this.iptables(cleanup.args, cleanup.ipv6);
      this.cleanup.pop();
    }
  }
}
