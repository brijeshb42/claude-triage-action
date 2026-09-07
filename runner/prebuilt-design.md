# Prebuilt image and repository Node

Usage: callers keep using `runner@<commit>`. `repository-node-version: auto`
detects the repository requirement; an explicit semver value overrides it.
`node-version` remains the independent trusted host supervisor version.

Shape: `prepareRunnerNode(sources, requestedVersion, exec) -> PreparedNodeRuntime`
hides release resolution, checksum verification and installation. The caller
adds the returned bin directory to the dependency and agent PATH. All downloads
and execution occur inside gVisor before dependency scripts or model access.
The executable workspace volume survives sandbox restarts and is deleted at exit.

Synthesis: a supervisor-managed installer reuses the existing pure Node resolver
without coupling runner execution to the Cloudflare bridge. An image entrypoint
was considered separately: it hides installation from the supervisor but requires
a second resolver implementation and a protocol for reporting setup failure.
The supervisor-managed shape keeps the existing lifecycle and failure cleanup.

The image build is a separate, credential-free Docker build, published by a
model-free job. Consumers pull a checked-in GHCR digest anonymously; issue runs
cannot build or publish images. Image source changes publish a new candidate;
maintainers test and commit its digest, rather than moving existing consumers.

Tradeoffs: we accept a small Node download when the image version differs, and
an explicit digest promotion, in exchange for one image across repositories and
immutable action revisions. Auto selection retains the existing engines-first,
minimum-published-compatible-version policy (then .node-version, .nvmrc, Volta,
image fallback). Non-semver aliases fail clearly; callers can supply a semver
override. Package-manager/Claude compatibility with very old Node versions is
not guaranteed. The integration fixture must prove selection across restarts.

Implementation begins with image publication, then installer tests and real
gVisor validation before promoting the image and consumer action revision.
