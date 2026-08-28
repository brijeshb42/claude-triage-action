# pnpm's official image contains the standalone CLI without coupling it to Node.js.
FROM ghcr.io/pnpm/pnpm:11.22.0@sha256:eba76954b37ec1ba6187f0adb39caee1e31733194857eedd01319da0af3fa00d AS pnpm

FROM docker.io/cloudflare/sandbox:0.12.8

USER root

ARG NODE_VERSION=22.23.2

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}/bin:${PATH}"

COPY --from=pnpm /pnpm /pnpm

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    jq \
    procps \
    python3 \
    ripgrep \
    tar \
    xz-utils \
    && curl --fail --silent --show-error --location \
      "https://nodejs.org/download/release/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      --output "/tmp/node-v${NODE_VERSION}-linux-x64.tar.xz" \
    && curl --fail --silent --show-error --location \
      "https://nodejs.org/download/release/v${NODE_VERSION}/SHASUMS256.txt" \
      --output /tmp/SHASUMS256.txt \
    && cd /tmp \
    && grep " node-v${NODE_VERSION}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum --check --strict \
    && tar --extract --file "/tmp/node-v${NODE_VERSION}-linux-x64.tar.xz" \
      --directory /usr/local --strip-components=1 \
    && rm -rf /var/lib/apt/lists/* /tmp/node-* /tmp/SHASUMS256.txt

RUN mkdir -p /workspace \
    && if ! id sandbox >/dev/null 2>&1; then useradd -m -s /bin/bash -d /home/sandbox sandbox; fi \
    && chown sandbox:sandbox /workspace \
    && chmod 700 /root

USER sandbox
WORKDIR /workspace
