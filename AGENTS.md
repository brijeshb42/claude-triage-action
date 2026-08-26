# Claude triage action lab

- Keep Claude Code on GitHub Actions; never install or run it in the Cloudflare Sandbox.
- Never place Anthropic or GitHub credentials in a sandbox.
- Keep the agent job read-only. GitHub publication belongs in a separate job without model access.
- Pin GitHub Actions to full commit SHAs and annotate the exact version.
- Keep `@cloudflare/sandbox` and the `cloudflare/sandbox` Docker image on the same version.
- Rebuild and commit `dist/` whenever `src/` changes.
- Open pull requests as drafts.
