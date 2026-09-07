# Runner-sandboxed Claude action

This independent action captures an issue, copies a clean tracked checkout into a
fresh gVisor sandbox, installs dependencies, and runs Claude Code with native
Read/Write/Edit/Glob/Grep/Bash tools. It uploads `claude-triage.patch` and
`claude-triage-result.json` for the separate `runner/publish` action. It does not
require the existing triage artifact or Cloudflare Bridge.

The complete opt-in example is
[runner-example.yml](../.github/workflows/runner-example.yml). It uses manual
dispatch, which requires repository write access, and checks out the default
branch. It does not execute PR heads or issue commands on the host. In a consuming
repository, replace `./runner` and `./runner/publish` with
`brijeshb42/claude-triage-action/runner@<full-commit-SHA>` and
`brijeshb42/claude-triage-action/runner/publish@<same-full-commit-SHA>`.
Annotate the reviewed revision when pinning it.

Configure the `ANTHROPIC_FEDERATION_RULE_ID`, `ANTHROPIC_ORGANIZATION_ID`,
`ANTHROPIC_SERVICE_ACCOUNT_ID`, and `ANTHROPIC_WORKSPACE_ID` repository variables
and authorize the workflow in the Anthropic federation rule. The agent job needs
`id-token: write` for federation, plus `contents: read` and `issues: read`.
Alternatively pass `anthropic-api-key` from a secret, omit all federation inputs,
and remove `id-token: write`. Credentials stay in the host-side gateway in either
case. The publisher job alone receives GitHub write permissions. Enable the
repository setting allowing Actions to create pull requests, or supply an
appropriately scoped GitHub App token only to the publisher.

## Requirements and scope

- An ephemeral GitHub-hosted `ubuntu-24.04` x64 runner, with no service/job
  containers. Installing the pinned runtime restarts Docker before the sandbox
  starts. Self-hosted, ARM, macOS, Windows, and slim runners are rejected.
- Docker's iptables backend and passwordless sudo, as supplied by that runner.
- A clean tracked checkout of trusted base source. Submodules are unsupported.
- The image includes Node 22.23.2, pnpm 11.22.0, and Claude Code 2.1.241.
  Repository Node auto-selection is not implemented in this independent action.
  Use repositories compatible with that runtime. npm and Yarn lockfiles are
  recognized; custom install commands are supported inside the sandbox.
- Preview publication and cross-run dependency caches are disabled. Only a
  successfully completed agent session claiming a completed fix exports a patch.
  Failed sessions produce a safe failure result and an empty patch.

The publisher is an independent copy of the existing validation/publishing
action, with runner attribution. A contract test checks that it stays equivalent
apart from attribution and its bundle paths. Existing actions remain unchanged.

## Isolation and limits

The container runs as a non-root user under `runsc`/systrap, with a read-only
root filesystem, dropped capabilities, no-new-privileges, private process state,
IPv6 blocked at the host firewall, 2 CPU and 4 GiB memory limits, and a 512-process ceiling. Its fresh
workspace volume is removed after the run. No host checkout, home, credentials,
Actions command files, or Docker socket is mounted into it. Disk space remains
bounded by the runner's available disk, not a per-volume quota.

The host firewall permits only the credential gateway port from the sandbox to
the host, and blocks forwarded private, link-local, and reserved IPv4 ranges.
Public outbound access is enabled for dependencies and tests. A single read-only
bind of the action's credential-free `resolv.conf` supplies public DNS resolvers
(1.1.1.1 and 8.8.8.8); Docker's embedded loopback resolver is inaccessible inside
gVisor. This is not a data
loss prevention system: sandbox code can send source to public services.

Claude gets an ephemeral gateway capability, not an Anthropic or GitHub token.
Any process inside the sandbox can use that capability. The gateway only proxies
Messages and token-count requests for the configured exact model, rejects
redirects, strips client credentials, and enforces request/output limits. Defaults
are 200 requests (including retries/counting), 16,384 output tokens per request,
4 MiB per request body, and a 30-minute agent deadline. These are not a dollar
budget; configure account-side spending limits as appropriate. Model inference
still happens at Anthropic; filesystem/tool calls stay inside the container.

Dependencies run before the gateway capability is given to Claude. The container
restarts after installation to terminate script descendants. After Claude, model
access is revoked and another restart kills descendants before patch collection.
Repository code and the agent share a trust boundary, so results and test claims
are still untrusted. Publication validates the patch without running repository
code and always creates a draft PR.

The supervisor suppresses raw child output in Actions logs to prevent workflow
command injection. It captures bounded output for result parsing. Cleanup runs on
failure, SIGINT, and SIGTERM; abrupt runner loss relies on GitHub destroying the
ephemeral machine. There is no fallback to ordinary Docker if gVisor fails.

## Development and evidence

Run `pnpm test`, `pnpm typecheck`, and `pnpm build`; commit the regenerated
`dist/runner-main.mjs` bundle and map with source changes. The separate
`runner-ci.yml` workflow runs the real gVisor integration checks without any
Anthropic/GitHub secrets or paid inference. The fixture supplies fake Anthropic
responses to the actual pinned Claude CLI and verifies artifact collection.
Live federation and a real issue fix additionally require the configured
`runner-example.yml` workflow.

Authentication follows the pinned
[Anthropic action](https://github.com/anthropics/claude-code-action/blob/c81e3bc69d1b18badbb63ba39581218f02421678/base-action/src/workload-identity.ts)
and [official federation exchange](https://github.com/anthropics/anthropic-sdk-typescript/blob/ba14b1f4fdf2e840a7b32297965342a099f6201d/src/lib/credentials/oidc-federation.ts).
The [credential-proxy design](https://code.claude.com/docs/en/agent-sdk/secure-deployment)
and [gVisor systrap](https://gvisor.dev/docs/user_guide/platforms/) avoid placing
upstream credentials inside the execution boundary or requiring nested KVM.
