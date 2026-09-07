#!/usr/bin/env bash
set -euo pipefail

# This changes the daemon only on an ephemeral runner, before any sandbox exists.
if [[ "${RUNNER_ENVIRONMENT:-}" != github-hosted || "${RUNNER_OS:-}" != Linux || "${RUNNER_ARCH:-}" != X64 ]]; then
  echo 'runner action requires a GitHub-hosted Linux X64 runner' >&2
  exit 1
fi
source /etc/os-release
if [[ "${ID:-}" != ubuntu || "${VERSION_ID:-}" != 24.04 || "$(uname -m)" != x86_64 ]]; then
  echo 'runner action requires Ubuntu 24.04 x86_64' >&2
  exit 1
fi
if [[ -n "$(docker ps --quiet)" ]]; then
  echo 'gVisor installation requires no running Docker containers before daemon restart' >&2
  exit 1
fi
sudo -n true
runsc_node="$(command -v node)"
readonly runsc_node
if [[ "$runsc_node" != /* ]]; then
  echo 'runner action requires an absolute Node.js executable path' >&2
  exit 1
fi

# Official release distribution includes matching gvisor-bin sidecars; preserve
# that layout instead of installing the runsc executable alone.
readonly runsc_release='release-20260831.0'
readonly runsc_sha256='014b3871a5c698c802fd7a03758e0dbf4c1683f9e3f8c743979ea66bbf6553a4'
readonly runsc_install='/usr/local/lib/claude-triage-runner'
runsc_tmp="$(mktemp -d /tmp/claude-runsc.XXXXXXXX)"
readonly runsc_tmp
cleanup() {
  # Only these two files are created in this uniquely owned temporary directory.
  rm -f -- "$runsc_tmp/gvisor-x86_64.tar.bz2" "$runsc_tmp/archive-members"
  rmdir -- "$runsc_tmp"
}
trap cleanup EXIT
curl --fail --silent --show-error --location --retry 3 --connect-timeout 20 --max-time 600 \
  "https://github.com/google/gvisor/releases/download/$runsc_release/gvisor-x86_64.tar.bz2" \
  --output "$runsc_tmp/gvisor-x86_64.tar.bz2"
printf '%s  %s\n' "$runsc_sha256" "$runsc_tmp/gvisor-x86_64.tar.bz2" | sha256sum --check --strict
tar --list --bzip2 --file "$runsc_tmp/gvisor-x86_64.tar.bz2" > "$runsc_tmp/archive-members"
grep -qx 'runsc' "$runsc_tmp/archive-members"
grep -qx 'gvisor-bin/gvisor_sentry' "$runsc_tmp/archive-members"
sudo -n install -d -m 0755 "$runsc_install"
sudo -n tar --extract --bzip2 --no-same-owner \
  --file "$runsc_tmp/gvisor-x86_64.tar.bz2" --directory "$runsc_install"
"$runsc_install/runsc" --version

# Merge the named runtime into the existing config, preserving default-runtime,
# registry mirrors, logging, networking and all other daemon settings.
sudo -n "$runsc_node" --input-type=commonjs - <<'NODE'
const fs = require('node:fs');
const daemonFile = '/etc/docker/daemon.json';
const config = fs.existsSync(daemonFile) ? JSON.parse(fs.readFileSync(daemonFile, 'utf8')) : {};
if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid Docker daemon configuration');
if (config.runtimes !== undefined && (!config.runtimes || typeof config.runtimes !== 'object' || Array.isArray(config.runtimes))) {
  throw new Error('Invalid Docker runtimes configuration');
}
config.runtimes = {
  ...config.runtimes,
  'claude-runsc': {
    path: '/usr/local/lib/claude-triage-runner/runsc',
    runtimeArgs: ['--platform=systrap'],
  },
};
fs.mkdirSync('/etc/docker', { recursive: true, mode: 0o755 });
const temporaryFile = `/etc/docker/.claude-runsc-daemon-${process.pid}.json`;
fs.writeFileSync(temporaryFile, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o644, flag: 'wx' });
fs.renameSync(temporaryFile, daemonFile);
NODE
sudo -n dockerd --validate --config-file /etc/docker/daemon.json
sudo -n systemctl restart docker
docker info --format '{{json .Runtimes}}' | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  if (!Object.hasOwn(JSON.parse(input), "claude-runsc")) throw new Error("Docker did not register claude-runsc");
});
'
