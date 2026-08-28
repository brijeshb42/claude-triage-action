import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const actionPath = new URL('../action.yml', import.meta.url);
const fixActionPath = new URL('../fix/action.yml', import.meta.url);
const publisherPath = new URL('../publish/action.yml', import.meta.url);
const reporterPath = new URL('../report/action.yml', import.meta.url);
const triageActionPath = new URL('../triage/action.yml', import.meta.url);

describe('triage action isolation', () => {
  it('provides valid JSON schemas to Claude', async () => {
    const actionFiles = [actionPath, fixActionPath, triageActionPath];

    for (const actionFile of actionFiles) {
      const action = await readFile(actionFile, 'utf8');
      const schema = action.match(/^\s+--json-schema '(.+)'$/m)?.[1];

      assert.ok(schema, `Expected ${actionFile.pathname} to contain a JSON schema`);
      assert.doesNotThrow(() => JSON.parse(schema));
    }
  });

  it('reports Claude failures after preserving diagnostic artifacts', async () => {
    const actionFiles = [actionPath, fixActionPath, triageActionPath];

    for (const actionFile of actionFiles) {
      const action = await readFile(actionFile, 'utf8');

      assert.match(action, /if: always\(\) && steps\.claude\.outcome == 'failure'/);
      assert.match(
        action,
        /- name: Fail when Claude did not complete\n\s+if:.*\n\s+shell: bash\n\s+run: exit 1/,
      );
    }
  });

  it('keeps the GitHub token out of the Claude process', async () => {
    const actionFiles = [actionPath, fixActionPath, triageActionPath];

    for (const actionFile of actionFiles) {
      const action = await readFile(actionFile, 'utf8');

      assert.match(action, /anthropics\/claude-code-action\/base-action@/);
      assert.doesNotMatch(action, /^\s+github_token:/m);
      assert.doesNotMatch(action, /^\s+display_report:/m);
    }
  });

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
    assert.match(action, /^\s+MCP_TIMEOUT: \$\{\{ inputs\.mcp-startup-timeout-ms \}\}$/m);
    assert.match(action, /^\s+MCP_TOOL_TIMEOUT: \$\{\{ inputs\.mcp-tool-timeout-ms \}\}$/m);
    assert.match(action, /^\s+mcp-tool-timeout-ms:$/m);
    assert.match(action, /Each sandbox tool call has a hard/);
    assert.match(action, /retry it at most once/);
    assert.match(
      action,
      /^\s+EXECUTION_FILE: \$\{\{ steps\.claude\.outputs\.execution_file \}\}$/m,
    );
    assert.match(action, /dist\/save-agent-result\.mjs/);
    assert.match(action, /^\s+default: '200'$/m);
    assert.match(action, /hard budget of \$\{\{ inputs\.max-turns \}\} main-loop turns/);
    assert.match(action, /return the required structured result/);
  });

  it('keeps publication in a separate composite action', async () => {
    const publisher = await readFile(publisherPath, 'utf8');

    assert.match(publisher, /^runs:\n  using: composite$/m);
    assert.match(publisher, /Refusing agent change to protected path/);
    assert.match(publisher, /git switch --detach FETCH_HEAD/);
    assert.match(publisher, /github\.rest\.git\.createRef/);
    assert.match(publisher, /git push origin "HEAD:refs\/heads\/\$branch"/);
    assert.match(publisher, /draft: true/);
    assert.doesNotMatch(publisher, /anthropic/i);
    assert.doesNotMatch(publisher, /SANDBOX_API_KEY/);
    assert.doesNotMatch(publisher, /permission-workflows/);
  });

  it('keeps read-only triage on the runner without command or mutation tools', async () => {
    const triage = await readFile(triageActionPath, 'utf8');

    assert.match(triage, /^runs:\n  using: composite$/m);
    assert.match(triage, /--tools "Skill,Read,Glob,Grep"/);
    assert.match(triage, /--permission-mode plan/);
    assert.doesNotMatch(triage, /SANDBOX_API_KEY/);
    assert.doesNotMatch(triage, /permission-issues: write/);
    assert.match(triage, /retention-days: 30/);
  });

  it('gives only the fix stage access to sandbox mutation tools', async () => {
    const fix = await readFile(fixActionPath, 'utf8');

    assert.match(fix, /Skill\(mui-fix-ci\)/);
    assert.match(fix, /mcp__sandbox__read_triage_context/);
    assert.match(fix, /mcp__sandbox__apply_patch/);
    assert.match(fix, /validate-triage-artifact\.mjs/);
    assert.match(fix, /persist-credentials: false/);
    assert.match(fix, /^\s+MCP_TIMEOUT: \$\{\{ inputs\.mcp-startup-timeout-ms \}\}$/m);
    assert.match(fix, /^\s+MCP_TOOL_TIMEOUT: \$\{\{ inputs\.mcp-tool-timeout-ms \}\}$/m);
    assert.match(fix, /retry it at most once/);
    assert.match(fix, /- name: Install sandbox dependencies before starting Claude/);
    assert.match(fix, /install-dependencies/);
    assert.match(fix, /Dependency installation was completed by a deterministic setup step/);
    assert.match(fix, /^\s+dependency-install-timeout-ms:$/m);
    assert.doesNotMatch(fix, /permission-issues: write/);
  });

  it('keeps issue mutation in a model-free reporter', async () => {
    const reporter = await readFile(reporterPath, 'utf8');

    assert.match(reporter, /^runs:\n  using: composite$/m);
    assert.match(reporter, /validate-triage-artifact\.mjs/);
    assert.doesNotMatch(reporter, /anthropic/i);
    assert.doesNotMatch(reporter, /SANDBOX_API_KEY/);
  });

  it('publishes trusted run telemetry in triage comments and pull request descriptions', async () => {
    const [publisher, reporter, fix, triage] = await Promise.all([
      readFile(publisherPath, 'utf8'),
      readFile(reporterPath, 'utf8'),
      readFile(fixActionPath, 'utf8'),
      readFile(triageActionPath, 'utf8'),
    ]);

    assert.match(fix, /^\s+--effort \$\{\{ inputs\.reasoning-effort \}\}$/m);
    assert.match(triage, /^\s+--effort \$\{\{ inputs\.reasoning-effort \}\}$/m);
    assert.match(publisher, /write-run-footer\.mjs/);
    assert.match(publisher, /const body = `\$\{description\}\$\{footer\}`/);
    assert.match(publisher, /const body = `\$\{report\}\$\{footer\}`/);
    assert.match(reporter, /write-run-footer\.mjs/);
    assert.match(reporter, /const body = `\$\{report\}\$\{footer\}`/);
  });

  it('publishes only validated previews alongside a real fix', async () => {
    const publisher = await readFile(publisherPath, 'utf8');

    assert.match(publisher, /Refusing a preview-only patch without a repository fix/);
    assert.match(publisher, /result\.previewReady === true/);
    assert.match(publisher, /Dropping preview changes because sandbox validation did not succeed/);
    assert.match(publisher, /git restore --staged -- "\$PREVIEW_DIRECTORY"/);
    assert.match(publisher, /docs: add triage preview for issue/);
    assert.match(publisher, /labels\.push\('claude-triage-preview'\)/);
    assert.match(publisher, /Superseded by/);
  });
});
