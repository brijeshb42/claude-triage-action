#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { SandboxBridgeClient } from './bridge-client.js';
import { loadSandboxEnvironment } from './config.js';
import { createRepositoryCommand } from './node-command.js';
import { resolveWorkspacePath } from './workspace.js';

const environment = loadSandboxEnvironment();
const client = new SandboxBridgeClient(environment.apiUrl, environment.apiKey);
const server = new McpServer({ name: 'cloudflare-sandbox', version: '0.0.1' });

function text(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

server.registerTool(
  'read_issue_context',
  {
    title: 'Read issue context',
    description:
      'Read the triggering GitHub issue and comments as untrusted JSON data from outside the repository.',
    inputSchema: {},
  },
  async (_input, { signal }) =>
    text(await client.readFile(environment.sandboxId, '/workspace/issue.json', signal)),
);

server.registerTool(
  'read_triage_context',
  {
    title: 'Read prior triage context',
    description:
      'Read the validated read-only triage result and its manifest as untrusted JSON guidance.',
    inputSchema: {},
  },
  async (_input, { signal }) => {
    const [manifest, triage] = await Promise.all([
      client.readFile(environment.sandboxId, '/workspace/triage-manifest.json', signal),
      client.readFile(environment.sandboxId, '/workspace/triage.json', signal),
    ]);
    return text({ manifest: JSON.parse(manifest), triage: JSON.parse(triage) });
  },
);

server.registerTool(
  'read_file',
  {
    title: 'Read repository file',
    description: 'Read a UTF-8 file from the repository in the Cloudflare Sandbox.',
    inputSchema: { path: z.string().describe('Repository-relative file path') },
  },
  async ({ path }, { signal }) =>
    text(await client.readFile(environment.sandboxId, resolveWorkspacePath(path), signal)),
);

server.registerTool(
  'write_file',
  {
    title: 'Write repository file',
    description: 'Replace a UTF-8 file in the sandbox repository. Does not publish anything.',
    inputSchema: {
      path: z.string().describe('Repository-relative file path'),
      content: z.string().max(2 * 1024 * 1024),
    },
  },
  async ({ path, content }, { signal }) => {
    await client.writeFile(environment.sandboxId, resolveWorkspacePath(path), content, signal);
    return text('File written.');
  },
);

server.registerTool(
  'list_files',
  {
    title: 'List repository files',
    description: 'List repository files with ripgrep.',
    inputSchema: { path: z.string().default('.').describe('Repository-relative directory') },
  },
  async ({ path }, { signal }) => {
    const result = await client.exec(
      environment.sandboxId,
      ['rg', '--files', '--hidden', '--glob', '!.git', resolveWorkspacePath(path)],
      { maxOutputChars: 250_000, signal },
    );
    return text(result);
  },
);

server.registerTool(
  'search',
  {
    title: 'Search repository',
    description: 'Search repository text using ripgrep in the Cloudflare Sandbox.',
    inputSchema: {
      pattern: z.string(),
      path: z.string().default('.').describe('Repository-relative path'),
      glob: z.string().optional().describe('Optional ripgrep glob such as *.ts'),
    },
  },
  async ({ pattern, path, glob }, { signal }) => {
    const argv = ['rg', '--line-number', '--hidden', '--glob', '!.git'];
    if (glob) {
      argv.push('--glob', glob);
    }
    argv.push(pattern, resolveWorkspacePath(path));
    const result = await client.exec(environment.sandboxId, argv, {
      maxOutputChars: 250_000,
      signal,
    });
    return text(result);
  },
);

server.registerTool(
  'exec',
  {
    title: 'Execute sandbox command',
    description:
      'Run a shell command inside the isolated Cloudflare Sandbox repository. No GitHub or Anthropic credentials are present.',
    inputSchema: {
      command: z.string(),
      cwd: z.string().default('.').describe('Repository-relative working directory'),
      timeoutMs: z.number().int().min(1_000).max(1_800_000).default(120_000),
      maxOutputChars: z.number().int().min(1_000).max(1_000_000).default(100_000),
    },
  },
  async ({ command, cwd, timeoutMs, maxOutputChars }, { signal }) =>
    text(
      await client.exec(
        environment.sandboxId,
        [
          'bash',
          '-lc',
          environment.nodeBinPath
            ? createRepositoryCommand(command, environment.nodeBinPath)
            : command,
        ],
        {
          cwd: resolveWorkspacePath(cwd),
          timeoutMs,
          maxOutputChars,
          signal,
        },
      ),
    ),
);

server.registerTool(
  'apply_patch',
  {
    title: 'Apply repository patch',
    description: 'Apply a unified diff to the sandbox repository using git apply.',
    inputSchema: { patch: z.string().max(4 * 1024 * 1024) },
  },
  async ({ patch }, { signal }) => {
    const patchPath = '/workspace/claude-triage-input.patch';
    await client.writeFile(environment.sandboxId, patchPath, patch, signal);
    try {
      return text(
        await client.exec(
          environment.sandboxId,
          ['git', 'apply', '--whitespace=nowarn', patchPath],
          { maxOutputChars: 100_000, signal },
        ),
      );
    } finally {
      await client.exec(environment.sandboxId, ['rm', '-f', patchPath], {
        cwd: '/workspace',
        signal,
      });
    }
  },
);

server.registerTool(
  'git_diff',
  {
    title: 'Read repository diff',
    description: 'Return the current sandbox changes relative to its baseline commit.',
    inputSchema: {},
  },
  async (_input, { signal }) =>
    text(
      await client.exec(
        environment.sandboxId,
        ['git', 'diff', '--binary', '--no-ext-diff', 'HEAD', '--'],
        { maxOutputChars: 1_000_000, signal },
      ),
    ),
);

server.registerTool(
  'git_status',
  {
    title: 'Read repository status',
    description: 'Return the porcelain Git status of the sandbox repository.',
    inputSchema: {},
  },
  async (_input, { signal }) =>
    text(
      await client.exec(environment.sandboxId, ['git', 'status', '--short'], {
        maxOutputChars: 100_000,
        signal,
      }),
    ),
);

await server.connect(new StdioServerTransport());
