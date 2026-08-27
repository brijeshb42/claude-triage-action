export function assertNodeBinPath(nodeBinPath: string): void {
  if (
    nodeBinPath !== '/usr/local/bin' &&
    !/^\/workspace\/\.claude-triage\/node\/v\d+\.\d+\.\d+\/bin$/.test(nodeBinPath)
  ) {
    throw new Error(`Unexpected sandbox Node.js binary path: ${nodeBinPath}.`);
  }
}

export function createRepositoryCommand(command: string, nodeBinPath: string): string {
  assertNodeBinPath(nodeBinPath);
  return `export PATH='${nodeBinPath}':$PATH\n${command}`;
}
