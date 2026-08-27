import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const actionPath = new URL('../action.yml', import.meta.url);
const publisherPath = new URL('../publish/action.yml', import.meta.url);

describe('triage action isolation', () => {
  it('is a runner-agnostic composite action', async () => {
    const action = await readFile(actionPath, 'utf8');

    assert.match(action, /^runs:\n  using: composite$/m);
    assert.doesNotMatch(action, /^\s*runs-on:/m);
    assert.doesNotMatch(action, /^\s*permissions:/m);
  });

  it('exposes only the skill built-in and the explicit sandbox MCP tools', async () => {
    const action = await readFile(actionPath, 'utf8');
    const allowedTools = [
      'Skill(mui-triage-ci)',
      'mcp__sandbox__read_issue_context',
      'mcp__sandbox__read_file',
      'mcp__sandbox__write_file',
      'mcp__sandbox__list_files',
      'mcp__sandbox__search',
      'mcp__sandbox__exec',
      'mcp__sandbox__apply_patch',
      'mcp__sandbox__git_diff',
      'mcp__sandbox__git_status',
    ];

    assert.match(action, /^\s+--strict-mcp-config$/m);
    assert.match(action, /^\s+--tools "Skill"$/m);
    assert.match(action, /^\s+--permission-mode dontAsk$/m);
    assert.ok(action.split('\n').includes(`          --allowedTools "${allowedTools.join(',')}"`));
    assert.match(
      action,
      /^\s+CLAUDE_BYTE_STREAM_IDLE_TIMEOUT_MS: \$\{\{ inputs\.claude-stream-idle-timeout-ms \}\}$/m,
    );
    assert.match(
      action,
      /^\s+CLAUDE_STREAM_IDLE_TIMEOUT_MS: \$\{\{ inputs\.claude-stream-idle-timeout-ms \}\}$/m,
    );
  });

  it('keeps publication in a separate composite action', async () => {
    const publisher = await readFile(publisherPath, 'utf8');

    assert.match(publisher, /^runs:\n  using: composite$/m);
    assert.match(publisher, /Refusing agent change to protected path/);
    assert.match(publisher, /draft: true/);
    assert.doesNotMatch(publisher, /anthropic/i);
    assert.doesNotMatch(publisher, /SANDBOX_API_KEY/);
  });

  it('publishes only validated previews alongside a real fix', async () => {
    const publisher = await readFile(publisherPath, 'utf8');

    assert.match(publisher, /Refusing a preview-only patch without a repository fix/);
    assert.match(publisher, /result\.previewReady === true/);
    assert.match(publisher, /Dropping preview changes because sandbox validation did not succeed/);
    assert.match(publisher, /git restore --staged -- "\$PREVIEW_DIRECTORY"/);
    assert.match(publisher, /docs: add triage preview for issue/);
    assert.match(publisher, /labels\.push\('claude-triage-preview'\)/);
  });
});
