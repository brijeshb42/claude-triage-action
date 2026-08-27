import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import type { RepositoryArchive } from '../src/archive.js';
import { SandboxBridgeClient } from '../src/bridge-client.js';
import { hydrateRepositoryArchive } from '../src/sandbox-cli.js';

describe('hydrateRepositoryArchive', () => {
  it('retries only a failed part and reuses all uploaded parts when extraction fails', async () => {
    const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'claude-triage-hydration-'));
    const archivePath = path.join(temporaryDirectory, 'repository.tar.gz');
    const archiveBytes = Buffer.from('0123456789');
    await writeFile(archivePath, archiveBytes);

    const uploadCounts = new Map<string, number>();
    let execCount = 0;
    const execWorkingDirectories: string[] = [];
    const server = createServer(async (request, response) => {
      const requestUrl = request.url ?? '';
      const requestChunks: Buffer[] = [];
      for await (const chunk of request) {
        requestChunks.push(Buffer.from(chunk));
      }

      if (request.method === 'GET') {
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('not found');
        return;
      }

      if (request.method === 'PUT') {
        const uploadCount = (uploadCounts.get(requestUrl) ?? 0) + 1;
        uploadCounts.set(requestUrl, uploadCount);
        if (requestUrl.endsWith('.claude-triage-part-000001') && uploadCount === 1) {
          response.writeHead(503, { 'Content-Type': 'text/plain' });
          response.end('try again');
          return;
        }
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end('{"ok":true}');
        return;
      }

      if (request.method === 'POST' && requestUrl.endsWith('/exec')) {
        execCount += 1;
        const requestBody: unknown = JSON.parse(Buffer.concat(requestChunks).toString('utf8'));
        if (
          !requestBody ||
          typeof requestBody !== 'object' ||
          !('cwd' in requestBody) ||
          typeof requestBody.cwd !== 'string'
        ) {
          throw new Error('Exec request did not contain a string cwd.');
        }
        execWorkingDirectories.push(requestBody.cwd);
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if (execCount === 1) {
          response.end('event: error\ndata: {"error":"transient extraction failure"}\n\n');
        } else {
          response.end('event: exit\ndata: {"exit_code":0}\n\n');
        }
        return;
      }

      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('not found');
    });
    server.listen(0);
    await once(server, 'listening');

    try {
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      const client = new SandboxBridgeClient(`http://localhost:${address.port}`, 'bridge-token');
      const archive: RepositoryArchive = {
        path: archivePath,
        byteLength: archiveBytes.byteLength,
        fileCount: 1,
        partBytes: 4,
        partCount: 3,
        sha256: createHash('sha256').update(archiveBytes).digest('hex'),
        dispose: async () => {},
      };

      await hydrateRepositoryArchive(client, 'sandbox-id', archive);

      const fileUrlPrefix = '/v1/sandbox/sandbox-id/file/workspace/';
      assert.equal(uploadCounts.get(`${fileUrlPrefix}.claude-triage-bootstrap`), 1);
      assert.equal(uploadCounts.get(`${fileUrlPrefix}.claude-triage-part-000000`), 1);
      assert.equal(uploadCounts.get(`${fileUrlPrefix}.claude-triage-part-000001`), 2);
      assert.equal(uploadCounts.get(`${fileUrlPrefix}.claude-triage-part-000002`), 1);
      assert.equal(execCount, 3, 'two extraction attempts followed by one cleanup command');
      assert.deepEqual(execWorkingDirectories, ['/workspace', '/workspace', '/workspace']);
    } finally {
      server.close();
      await once(server, 'close');
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
