FROM docker.io/cloudflare/sandbox:0.12.8

USER root

ARG NODE_VERSION=22.23.2
ARG PNPM_VERSION=11.22.0

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"

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
    && curl -fsSL https://get.pnpm.io/install.sh \
      | env PNPM_VERSION="${PNPM_VERSION}" SHELL=/bin/sh sh - \
    && test "$(pnpm --version)" = "${PNPM_VERSION}" \
    && rm -rf /var/lib/apt/lists/* /tmp/node-* /tmp/SHASUMS256.txt

RUN mkdir -p /workspace \
    && if ! id sandbox >/dev/null 2>&1; then useradd -m -s /bin/bash -d /home/sandbox sandbox; fi \
    && chown sandbox:sandbox /workspace \
    && chmod 700 /root

USER sandbox
WORKDIR /workspace
