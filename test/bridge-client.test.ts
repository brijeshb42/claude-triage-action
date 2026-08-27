import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { parseExecSse, SandboxBridgeClient } from '../src/bridge-client.js';

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

describe('SandboxBridgeClient', () => {
  it('uploads archive parts without converting their bytes to text', async () => {
    const received: Buffer[] = [];
    let requestHeaders: {
      authorization: string | undefined;
      contentType: string | undefined;
    } = { authorization: undefined, contentType: undefined };
    let requestUrl = '';
    const server = createServer(async (request, response) => {
      requestUrl = request.url ?? '';
      requestHeaders = {
        authorization: request.headers.authorization,
        contentType: request.headers['content-type'],
      };
      for await (const chunk of request) {
        received.push(Buffer.from(chunk));
      }
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end('{"ok":true}');
    });
    server.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const client = new SandboxBridgeClient(`http://localhost:${address.port}`, 'bridge-token');
      const bytes = Uint8Array.from([0, 255, 1, 128, 2]);

      await client.writeFile('sandbox-id', '/workspace/staging/part-000000', bytes);

      assert.equal(requestUrl, '/v1/sandbox/sandbox-id/file/workspace/staging/part-000000');
      assert.deepEqual(requestHeaders, {
        authorization: 'Bearer bridge-token',
        contentType: 'application/octet-stream',
      });
      assert.deepEqual(Buffer.concat(received), Buffer.from(bytes));
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
