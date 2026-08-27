# Claude triage action lab

Personal prototype for running Claude Code in GitHub Actions while all repository
commands and file mutations happen in an isolated Cloudflare Sandbox.

The repository contains three pieces:

- `action.yml` and `dist/`: a setup action plus a small stdio MCP server used by Claude Code.
- `.github/workflows/triage.yml`: a reusable issue-triage workflow.
- `bridge/`: a lightly customized deployment of Cloudflare's supported Sandbox Bridge.

Claude Code and Anthropic federation remain on the GitHub-hosted runner. The sandbox
receives a tracked source snapshot but no Anthropic or GitHub credentials.

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
Node.js and pnpm versions used by MUI.

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
