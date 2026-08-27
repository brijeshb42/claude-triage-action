# Claude triage action lab

Personal prototype for separating read-only issue analysis on GitHub Actions from
credential-free fix execution inside an isolated Cloudflare Sandbox.

The repository contains these reusable pieces:

- `triage/action.yml`: read-only analysis that creates a versioned, 30-day triage artifact.
- `fix/action.yml`: validates the newest eligible triage artifact, checks out its exact commit,
  and attempts the fix through the Sandbox MCP.
- `publish/action.yml`: a separate composite publisher that validates the untrusted patch
  before creating a draft pull request and superseding an older bot-owned draft.
- `report/action.yml`: a model-free issue reporter for triage-only and in-progress outcomes.
- `action.yml`: the temporary compatibility action for the original combined flow.
- `dist/` and `plugin/`: bundled helpers and the read-only/fix CI skills.
- `bridge/`: a lightly customized deployment of Cloudflare's supported Sandbox Bridge.

Claude Code and Anthropic federation remain on the GitHub-hosted runner. The sandbox
receives a tracked source snapshot but no Anthropic or GitHub credentials.

Large tracked snapshots are compressed as one `tar.gz`, streamed to the Bridge as fixed
16 MiB binary parts, reassembled with SHA-256 verification, and extracted once inside the
sandbox. Each failed part is retried independently, and extraction retries reuse the uploaded
parts.

The triage model can use only the read-only skill and Claude's read, glob, and grep tools.
It cannot execute or modify the checkout. The fix model can use only the fix skill and the
explicit Sandbox MCP tools. Unlisted native filesystem, shell, web, task, worktree,
messaging, and scheduling tools are removed from the fix context.

## Workflow setup

The consuming repository owns command parsing, runner labels, timeouts, permissions, and
concurrency. A typical flow is:

```text
@claude triage
      └─ read-only triage artifact
            ├─ non-actionable → trusted issue report
            └─ actionable → sandboxed fix artifact → trusted draft PR publisher

@claude fix
      └─ newest eligible triage artifact → sandboxed fix → trusted publisher
```

Triage artifacts are eligible for 14 days and retained for 30. They bind the repository ID,
issue, workflow, run, default branch, exact base SHA, schema, and expiry. An explicit fix can
override the model's disposition, but never those identity or freshness checks. The fix uses
the immutable issue snapshot saved by triage and does not reload later issue comments.

The three model/publication stages use separate jobs so neither Claude invocation receives a
write-enabled GitHub token. See the `brijeshb42/material-ui` prototype workflow for the full
command parser, automatic handoff, latest-artifact replay, reporter, GitHub App publisher, and
per-issue concurrency setup.

`snapshot-excludes` accepts newline-separated, repository-relative Git pathspecs. Plain
directory paths exclude their contents, and wildcard patterns can omit generated or bulky
tracked assets. Exclusions affect only the credential-free sandbox snapshot; the runner
checkout and publisher validation checkout remain complete.

The action sets both Claude Code response-stream watchdogs from
`claude-stream-idle-timeout-ms` (10 minutes by default). This avoids the shorter first-party
idle timeout aborting a valid long-thinking turn before Claude emits its first response byte.

Sandbox MCP startup is bounded by `mcp-startup-timeout-ms` (30 seconds by default), and each
tool call is bounded by `mcp-tool-timeout-ms` (10 minutes by default). Claude Code otherwise
allows an MCP tool to run for roughly 28 hours, which is unsuitable for a CI job when a remote
sandbox becomes unreachable. Bridge HTTP requests also stop shortly after their corresponding
sandbox command deadline so cleanup cannot consume the rest of the job indefinitely.

When a repository configures a disposable preview, keep a valid baseline project at that
path and describe its provider and validation commands in `.github/claude-triage.yml`.
The publisher accepts preview changes only alongside a real fix and only after the sandbox
reports successful validation. It puts the preview in a separate commit and adds the
`claude-triage-preview` label so repository-owned `pkg.pr.new` CI can publish and report it.

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

The checked-in `dist/` files are part of the action and must be rebuilt after changing
`src/`.

## Deploying the bridge

The bridge follows Cloudflare's Apache-2.0 licensed Sandbox Bridge template. Authenticate
Wrangler, set a bridge bearer token, and deploy. Cloudflare Containers currently requires
a Workers Paid plan and a Docker-compatible builder:

```bash
pnpm --dir bridge install
pnpm --dir bridge exec wrangler secret put SANDBOX_API_KEY
pnpm --dir bridge run deploy
```

For builders without Docker, `.github/workflows/deploy-bridge.yml` performs the container
build on a GitHub-hosted runner. Add a scoped `CLOUDFLARE_API_TOKEN` secret, set the
`CLOUDFLARE_ACCOUNT_ID` variable, and set `CLOUDFLARE_DEPLOY_ENABLED=true` only while a
deployment is intended.

The container image is pinned to the same version as `@cloudflare/sandbox` and adds the
Node.js and pnpm versions used by MUI. The deployed container uses Cloudflare's
`standard-1` instance type (4 GiB memory and 8 GB disk) so large repositories have room for
dependency installation and build output.

### Repository Node.js version

Repository commands default to `node-version: auto`. For every sandbox, the action reads
the root `package.json#engines.node`, resolves the oldest published Linux x64 Node.js
release satisfying that range, and uses it for all agent commands. This deliberately
tests the repository's minimum supported runtime rather than the developer-preferred
version. If `engines.node` is absent, the action checks `.node-version`, `.nvmrc`, and
`package.json#volta.node`, in that order, before falling back to the image's Node.js
version.

When the selected version is not already in the image, the action downloads the official
Node.js archive into the credential-free sandbox and verifies its SHA-256 checksum before
using it. Callers can override repository detection with a semver range:

```yaml
uses: brijeshb42/claude-triage-action@main
with:
  node-version: 24.x
```

## Prototype status

This is deliberately a lab repository. The first version uses the Bridge bearer token
from a GitHub Actions secret. Before broader private-repository use, put the Bridge behind
a GitHub-OIDC-validating Worker and make the Bridge reachable only through a service
binding.
