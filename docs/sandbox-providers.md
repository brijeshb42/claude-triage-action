# Sandbox provider evaluation

The action, CLI, and MCP use one provider-neutral HTTP contract:

```text
POST   /v1/sandbox
POST   /v1/sandbox/:id/exec
GET    /v1/sandbox/:id/file/*
PUT    /v1/sandbox/:id/file/*
DELETE /v1/sandbox/:id
```

The deployed Bridge selects a `SandboxBridgeAdapter` with `SANDBOX_PROVIDER` and translates
that contract to the provider SDK. Provider credentials remain Bridge secrets; they are not
sent to GitHub Actions, Claude, or the sandbox. Adding a provider therefore does not change
the action inputs, `sandbox-cli`, or Sandbox MCP.

## Cost model

The comparison below models a ten-minute Linux sandbox. Cloudflare `standard-1` uses its
fixed 0.5-vCPU/4-GiB/8-GB shape. The managed alternatives use a 2-vCPU/4-GiB shape where
available because that is their common build-oriented configuration. CPU is modeled as fully
utilized for a conservative comparison; actual duration and utilization can dominate the
result. Prices exclude plan credits, taxes, logs, control-plane requests, and any unpublished
network charge.

| Provider      | Modeled resources               | Approx. ten-minute compute + memory + ephemeral disk | Fixed-plan consideration                                                                 |
| ------------- | ------------------------------- | ---------------------------------------------------: | ---------------------------------------------------------------------------------------- |
| Cloudflare    | 0.5 vCPU, 4 GiB, 8 GB           |                        $0.0123 before included usage | $5 Workers Paid; includes 25 GiB-hours memory, 375 vCPU-minutes, and 200 GB-hours disk   |
| Daytona       | 2 vCPU, 4 GiB, 8 GB             |              $0.0277 conservatively billing all disk | Usage based; first 5 GiB storage is advertised free                                      |
| E2B           | 2 vCPU, 4 GiB, included storage |                                              $0.0276 | Hobby has a one-hour session limit; Pro is $150/month plus usage                         |
| Modal Sandbox | 1 physical core (2 vCPU), 4 GiB |                                              $0.0397 | Starter is $0 with usage; selected regions and non-preemptible execution add multipliers |
| Fly Machine   | 2 shared CPUs, 4 GiB            |              roughly $0.005-$0.006, region dependent | Raw VM price; not an equivalent managed sandbox control plane                            |

Cloudflare rates are $0.000020/vCPU-second, $0.0000025/GiB-second, and
$0.00000007/GB-second. Its memory and disk charges use provisioned resources while CPU uses
active usage. Egress is $0.025/GB in North America and Europe, $0.04/GB in most other regions,
and $0.05/GB in Oceania, Korea, and Taiwan, with large monthly allotments.

- [Cloudflare Containers pricing](https://developers.cloudflare.com/containers/pricing/)
- [Daytona pricing](https://www.daytona.io/pricing)
- [Daytona billing by lifecycle state](https://www.daytona.io/docs/en/billing/)
- [E2B pricing](https://e2b.dev/pricing)
- [Modal pricing](https://modal.com/pricing)
- [Modal Sandbox resource billing](https://modal.com/docs/guide/sandbox-resources)
- [Fly.io pricing](https://fly.io/docs/about/pricing/)

Daytona, E2B, and Modal do not itemize general Sandbox internet-egress rates on the cited
public pricing pages. Treat egress as an unresolved commercial input rather than assuming it
is free. Fly publishes region-dependent public egress from $0.02/GB in North America and
Europe to $0.12/GB in Africa and India.

## Operational comparison

### Cloudflare

Cloudflare is the current recommendation. It provides VM-isolated sandboxes, enforced
resource limits, global placement, scale-to-zero, low published egress, R2 mounts, and
R2-backed directory backups. The current integration is already working and the included
Workers Paid allocation absorbs early usage. Its main constraints are fixed instance shapes,
ephemeral container disk, and additional Workers/Durable Objects/log billing. A stopped or
sleeping container restarts from the image with a fresh disk.

- [Security model](https://developers.cloudflare.com/sandbox/concepts/security/)
- [Container lifecycle](https://developers.cloudflare.com/containers/platform-details/architecture/)
- [Backup and restore](https://developers.cloudflare.com/sandbox/guides/backup-restore/)

### Daytona

Daytona is the preferred second adapter. Its managed container sandbox starts from advertised
sub-90ms snapshots, and the TypeScript SDK exposes lifecycle, process, filesystem, metrics,
preview, snapshot, archive, volume, and network-policy APIs. The `daytona-medium` shape is
2 vCPU, 4 GiB memory, and 8 GiB disk. Stopped sandboxes bill only disk; archived container
sandboxes move their filesystem to object storage and stop billing. This makes dependency or
repository templates easier to retain than on an ephemeral Cloudflare disk.

The primary unknown is network cost. Tier 1 and 2 also impose organization-level network
restrictions, while custom per-sandbox allowlists become generally available at higher tiers.

- [Daytona sandboxes](https://www.daytona.io/docs/en/sandboxes/)
- [TypeScript SDK](https://www.daytona.io/docs/en/typescript-sdk/)
- [Filesystem API](https://www.daytona.io/docs/file-system-operations/)
- [Network limits](https://www.daytona.io/docs/en/network-limits/)

### E2B

E2B is purpose-built for AI code execution and has a small integration surface. CPU is
$0.000014/vCPU-second and memory is $0.0000045/GiB-second; 10 GiB storage is included on
Hobby and 20 GiB on Pro. The concerns are the $150/month Pro base, the Hobby one-hour session
ceiling, and no itemized public egress rate. It is a good implementation-speed fallback, but
not the first cost experiment.

### Modal

Modal offers elastic CPU, explicit resource ceilings, filesystem APIs, persistent Volumes,
and unusually strong outbound network controls that can be changed while a sandbox runs. It
charges Sandbox CPU and memory by the greater of requested or actual use. Volumes are useful
for caches, but the current v1 guidance recommends fewer than 50,000 files and v2 remains
beta, which matters for pnpm stores and `node_modules`.

- [Modal filesystem and Volumes](https://modal.com/docs/guide/sandbox-files)
- [Modal networking](https://modal.com/docs/guide/sandbox-networking)
- [Modal Volume scaling limits](https://modal.com/docs/guide/volumes)

### Fly Machines

Fly Machines can be materially cheaper on raw shared CPU and offer Firecracker-style VM
lifecycle plus persistent volumes and snapshots. They are infrastructure primitives rather
than an agent sandbox service: the Bridge would need to own image provisioning, command and
file agents, streaming, authentication, capacity management, cleanup, and more security
hardening. This becomes attractive only when run volume is high enough to amortize that
control-plane engineering.

## Recommendation and decision triggers

1. Keep Cloudflare as the production default while usage fits the included allocation.
2. Implement Daytona as the first alternate adapter and run identical benchmark issues on
   both providers before changing defaults.
3. Record per run: create latency, hydration latency, dependency-install wall/CPU time,
   validation wall/CPU time, peak memory, provisioned disk, bytes uploaded/downloaded,
   provider cost, and Claude cost.
4. Reconsider the default when another provider lowers total sandbox cost or p95 wall time by
   at least 25% over 30 representative runs. A small compute-price difference does not justify
   a second operational dependency.
5. Keep each run in a fresh sandbox. Use repository-scoped, content-addressed cache storage
   rather than reusing mutable sandbox IDs across issues.

For cross-run pnpm caching, key a provider-backed cache by repository ID, lockfile digest,
exact Node and pnpm versions, container image version, and install-command digest. Restore the
content-addressed package store, then run a clean immutable install and verify `git status`.
Never share install-script side effects across repositories.
