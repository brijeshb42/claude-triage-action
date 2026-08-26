import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExecSse } from '../src/bridge-client.js';

describe('parseExecSse', () => {
  it('decodes streamed stdout, stderr, and the exit code', () => {
    const payload = [
      `event: stdout\ndata: ${Buffer.from('hello ').toString('base64')}`,
      `event: stdout\ndata: ${Buffer.from('world').toString('base64')}`,
      `event: stderr\ndata: ${Buffer.from('warning').toString('base64')}`,
      'event: exit\ndata: {"exit_code":2}',
      '',
    ].join('\n\n');

    assert.deepEqual(parseExecSse(payload), {
      exitCode: 2,
      stdout: 'hello world',
      stderr: 'warning',
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  });

  it('reports truncation without losing the terminal event', () => {
    const payload = [
      `event: stdout\ndata: ${Buffer.from('123456789').toString('base64')}`,
      'event: exit\ndata: {"exit_code":0}',
      '',
    ].join('\n\n');

    assert.deepEqual(parseExecSse(payload, 4), {
      exitCode: 0,
      stdout: '1234',
      stderr: '',
      stdoutTruncated: true,
      stderrTruncated: false,
    });
  });
});
