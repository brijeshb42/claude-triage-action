import { parse } from 'yaml';
import { resolveWorkspacePath } from './workspace.js';

/**
 * Repository-owned preview configuration, read from the trusted checkout:
 *
 *   preview:
 *     directory: examples/triage-preview
 *     validation:
 *       - pnpm --dir examples/triage-preview install --ignore-workspace --lockfile=false
 *       - pnpm --dir examples/triage-preview --ignore-workspace build
 */
export interface PreviewConfig {
  directory: string;
  validation: string[];
}

export const PREVIEW_CONFIG_PATH = '.github/claude-triage.yml';

const MAX_VALIDATION_COMMANDS = 20;
const MAX_COMMAND_CHARS = 10_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseCommands(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_VALIDATION_COMMANDS) {
    throw new Error(`preview.validation must list at most ${MAX_VALIDATION_COMMANDS} commands.`);
  }
  return value.map((command) => {
    if (typeof command !== 'string' || !command.trim()) {
      throw new Error('Each preview.validation entry must be a non-empty string.');
    }
    if (command.length > MAX_COMMAND_CHARS || command.includes('\0')) {
      throw new Error('A preview.validation command is too long or contains a null byte.');
    }
    return command.trim();
  });
}

/** Parse the preview section, or return undefined when the file configures no preview. */
export function parsePreviewConfig(yamlText: string): PreviewConfig | undefined {
  const document: unknown = parse(yamlText);
  if (!isRecord(document) || document.preview === undefined) {
    return undefined;
  }
  const preview = document.preview;
  if (!isRecord(preview) || typeof preview.directory !== 'string' || !preview.directory.trim()) {
    throw new Error('preview.directory must be a repository-relative path.');
  }

  const directory = preview.directory.trim().replace(/\/+$/, '');
  // Throws for absolute paths and parent traversal.
  resolveWorkspacePath(directory);
  if (directory === '.') {
    throw new Error('preview.directory cannot be the repository root.');
  }

  return { directory, validation: parseCommands(preview.validation) };
}
