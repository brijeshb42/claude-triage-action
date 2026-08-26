import * as path from 'node:path';

const WORKSPACE_ROOT = '/workspace/repo';

export function resolveWorkspacePath(relativePath = '.'): string {
  if (relativePath.includes('\0')) {
    throw new Error('Workspace path contains a null byte.');
  }
  if (path.posix.isAbsolute(relativePath)) {
    throw new Error('Workspace paths must be relative.');
  }

  const normalized = path.posix.normalize(relativePath);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Workspace path escapes the repository root.');
  }

  return normalized === '.' ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}/${normalized}`;
}
