# Claude triage action lab

Personal prototype for running Claude Code in GitHub Actions while all repository
commands and file mutations happen in an isolated Cloudflare Sandbox.

The repository contains three pieces:

- `action.yml`, `dist/`, and `plugin/`: the composite triage action, its sandbox MCP server,
  and the non-interactive triage skill.
- `publish/action.yml`: a separate composite publisher that validates the untrusted patch
  before creating a draft pull request or issue comment.
- `bridge/`: a lightly customized deployment of Cloudflare's supported Sandbox Bridge.

Claude Code and Anthropic federation remain on the GitHub-hosted runner. The sandbox
receives a tracked source snapshot but no Anthropic or GitHub credentials.

Large tracked snapshots are compressed as one `tar.gz`, streamed to the Bridge as fixed
16 MiB binary parts, reassembled with SHA-256 verification, and extracted once inside the
sandbox. Each failed part is retried independently, and extraction retries reuse the uploaded
parts.

Claude can use only the trusted `mui-triage-ci` skill and the explicitly listed `sandbox`
MCP tools. Unlisted tool calls are denied, and native filesystem, shell, web, task,
worktree, messaging, and scheduling tools are removed from its context. All repository
access and execution crosses the authenticated Sandbox Bridge.

## Workflow setup

The repository using the action owns its workflow trigger, runner labels, timeouts, and
job permissions. The model and publisher remain separate jobs so the model never receives
a write-enabled GitHub token. Both jobs can select any runner that supports composite
JavaScript actions and Bash.

```yaml
name: Claude issue triage

on:
  issue_comment:
    types: [created]

permissions: {}

jobs:
  agent:
    if: >-
      github.event.issue.pull_request == null &&
      contains(github.event.comment.body, '@claude triage') &&
      contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'), github.event.comment.author_association)
    runs-on: ubuntu-24.04 # Selected by the repository using the action.
    timeout-minutes: 45
    permissions:
      contents: read
      id-token: write
      issues: read
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          persist-credentials: false
      - uses: brijeshb42/claude-triage-action@<full-commit-sha>
        with:
          sandbox-api-url: ${{ vars.SANDBOX_API_URL }}
          sandbox-api-key: ${{ secrets.SANDBOX_API_KEY }}
          anthropic-federation-rule-id: ${{ vars.ANTHROPIC_FEDERATION_RULE_ID }}
          anthropic-organization-id: ${{ vars.ANTHROPIC_ORGANIZATION_ID }}
          anthropic-service-account-id: ${{ vars.ANTHROPIC_SERVICE_ACCOUNT_ID }}
          anthropic-workspace-id: ${{ vars.ANTHROPIC_WORKSPACE_ID }}
          github-token: ${{ github.token }}
          issue-number: ${{ github.event.issue.number }}
          artifact-name: claude-triage-${{ github.event.issue.number }}-${{ github.run_id }}
          preview-directory: examples/triage-preview
          snapshot-excludes: |
            docs/public
            coverage/**

  publish:
    needs: agent
    if: always() && needs.agent.result != 'skipped'
    runs-on: ubuntu-24.04 # May differ from the agent runner.
    timeout-minutes: 10
    permissions:
      contents: write
      issues: write
      pull-requests: write
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: brijeshb42/claude-triage-action/publish@<full-commit-sha>
        with:
          artifact-name: claude-triage-${{ github.event.issue.number }}-${{ github.run_id }}
          github-token: ${{ github.token }}
          issue-number: ${{ github.event.issue.number }}
          default-branch: ${{ github.event.repository.default_branch }}
          preview-directory: examples/triage-preview
```

An acknowledgement reaction can be a third, short repository-owned job with only
`issues: write`. Keeping it outside the agent job preserves the read-only model boundary.

`snapshot-excludes` accepts newline-separated, repository-relative Git pathspecs. Plain
directory paths exclude their contents, and wildcard patterns can omit generated or bulky
tracked assets. Exclusions affect only the credential-free sandbox snapshot; the runner
checkout and publisher validation checkout remain complete.

The action sets both Claude Code response-stream watchdogs from
`claude-stream-idle-timeout-ms` (10 minutes by default). This avoids the shorter first-party
idle timeout aborting a valid long-thinking turn before Claude emits its first response byte.

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
