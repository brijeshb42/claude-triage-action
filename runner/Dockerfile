# Node.js 22.23.2, multi-platform official image manifest.
FROM node:22.23.2-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash build-essential ca-certificates curl git jq procps python3 ripgrep tar xz-utils \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @anthropic-ai/claude-code@2.1.241 pnpm@11.22.0 \
    && test "$(pnpm --version)" = '11.22.0' \
    && claude --version | grep -F '2.1.241'

COPY settings.json /opt/runner/settings.json
COPY mcp.json /opt/runner/mcp.json
# pnpm's managed CLI and linked package store must be executable and survive the
# process-killing restarts. The isolated home tmpfs deliberately remains noexec.
ENV XDG_DATA_HOME=/workspace/.runner-data
ENV XDG_CACHE_HOME=/workspace/.runner-cache
ENV TMPDIR=/workspace/.runner-tmp
RUN mkdir -p /workspace/.runner-data /workspace/.runner-cache /workspace/.runner-tmp /home/node/.claude \
    && chown -R node:node /workspace /home/node/.claude
USER node
WORKDIR /workspace
ENTRYPOINT ["sleep", "infinity"]
