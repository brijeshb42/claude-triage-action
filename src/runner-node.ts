import {
  detectNodeRequirement,
  findNodeArchiveChecksum,
  selectMinimumPublishedNodeRelease,
  type NodeRequirementSources,
  type PreparedNodeRuntime,
} from './node-runtime.js';

export const RUNNER_SYSTEM_PATH = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';

/** Repository code and downloaded toolchains stay in the disposable gVisor volume. */
export async function prepareRunnerNode(
  sources: NodeRequirementSources,
  requestedVersion: string,
  exec: (args: string[]) => Promise<string>,
): Promise<PreparedNodeRuntime> {
  const requirement = detectNodeRequirement(sources, requestedVersion);
  const download = (url: string) =>
    exec([
      'curl',
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--proto',
      '=https',
      '--proto-redir',
      '=https',
      '--max-time',
      '60',
      '--max-filesize',
      '4194304',
      url,
    ]);
  const releases: unknown = JSON.parse(await download('https://nodejs.org/dist/index.json'));
  if (
    !Array.isArray(releases) ||
    !releases.every(
      (release) =>
        release &&
        typeof release.version === 'string' &&
        Array.isArray(release.files) &&
        release.files.every((file: unknown) => typeof file === 'string'),
    )
  ) {
    throw new Error('Node.js returned an invalid release index.');
  }
  const selected = selectMinimumPublishedNodeRelease(requirement.range, releases);
  const current = (await exec(['/usr/local/bin/node', '--version'])).trim();
  if (current === `v${selected.version}`) {
    return { ...selected, requirement, binPath: '/usr/local/bin' };
  }
  const root = `https://nodejs.org/download/release/v${selected.version}`;
  const checksum = findNodeArchiveChecksum(
    await download(`${root}/SHASUMS256.txt`),
    selected.archiveName,
  );
  const directory = `/workspace/.runner-node/v${selected.version}`;
  // Version and checksum come from validated semver and SHA-256 values, never shell input.
  await exec([
    'bash',
    '-c',
    `set -euo pipefail
mkdir -p '${directory}'
curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --max-time 180 --max-filesize 104857600 '${root}/${selected.archiveName}' -o '${directory}/node.tar.xz'
echo '${checksum}  ${directory}/node.tar.xz' | sha256sum --check --status
tar --extract --xz --file '${directory}/node.tar.xz' --directory '${directory}' --strip-components=1 --no-same-owner
rm '${directory}/node.tar.xz'
test "$('${directory}/bin/node' --version)" = 'v${selected.version}'`,
  ]);
  return { ...selected, requirement, binPath: `${directory}/bin` };
}
