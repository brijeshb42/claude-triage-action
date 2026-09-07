# Runner action design

## Usage

`brijeshb42/claude-triage-action/runner@<commit>` takes an issue number,
read-only GitHub token, and Anthropic federation identifiers. It captures the
issue, copies tracked source into a fresh gVisor container, runs Claude Code with
native tools, and uploads a patch/result artifact. A separate job uses
`runner/publish` with a write-enabled token to validate the patch and open a draft.
An Anthropic API key is also supported, but stays in the host proxy.

## Grounding

The existing action runs Claude through Anthropic's base action and delegates
repository operations to Sandbox MCP. `src/archive.ts` supplies a credential-free
tracked snapshot. `src/agent-result.ts` defines the publisher's result contract;
the publisher validates patch size, paths, symlinks, and applicability without
executing repository code. Those contracts remain useful without the Bridge.
The existing entry points and Cloudflare deployment remain unchanged.

## Shape

The new composite action owns trusted setup, runtime installation, and upload.
A host supervisor owns a gateway, one isolated Docker network, and a gVisor
container for the complete run, including cleanup on errors and cancellation.
Only the gateway owns upstream authentication and OIDC refresh. The container
gets a job-local gateway capability, never Anthropic or GitHub credentials.
The capability can be used by any code in the sandbox; gateway request and token
ceilings therefore apply independently of Claude's own budget flags.

The supervisor copies source and immutable context in, installs dependencies,
runs Claude, disables model access, restarts the container to kill descendants,
then exports a bounded patch. Claude's binary/configuration live in the image's
read-only filesystem. No host checkout, home, Actions files, or Docker socket is
mounted. Native tool output is captured, never interpreted as Actions commands.
Preview publication is disabled in this first independent action.

Module boundaries: `runner-auth` owns authentication; `runner-gateway` owns API
policy and streaming; `runner-network` owns host/network isolation;
`runner-main` owns container lifetime, input preparation, execution, and artifacts.
Callers choose task budgets, not Docker flags or gateway upstreams.

## Synthesis decision

Selected a single supervisor with a credential-only proxy. This hides lifetime
coordination and keeps command execution entirely inside the container.
Considered separate setup/agent/export steps with a detached proxy: rejected
because callers would need to coordinate state, stale credentials, and partial
cleanup across steps. Considered retaining local Sandbox MCP: it preserves the
old provider abstraction but does not deliver the requested native-tool workflow.

## Tradeoffs and validation

We accept Linux/gVisor-specific setup for a stronger boundary on an ephemeral
GitHub-hosted runner. Public outbound dependency access permits data exfiltration
to public services; this is credential isolation, not a private-source DLP system.
Resource and API ceilings bound abuse, but do not distinguish Claude requests
from other sandbox processes. A sandbox escape remains a host-credential risk.
No mutable cache is shared across runs. The publisher remains model-free.

Tests must cover federation refresh, proxy policy/budgets/streaming, networking
rules, failed commands, truncated output, and artifact contracts. A dedicated
Ubuntu integration workflow exercises real gVisor with a fake upstream before
any paid model run. Live federation/model validation requires configured access.

Implementation review found that gVisor does not necessarily support Docker's
IPv6-disable sysctls. The host instead blocks bridge IPv6 INPUT/FORWARD traffic
independently, alongside Docker's IPv4-only network. Resource cleanup is registered
before daemon mutations because cancelling a Docker client does not cancel the
daemon's operation.
