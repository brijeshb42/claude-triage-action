import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { RunnerCredential } from './runner-auth.js';

export interface RunnerGateway {
  port: number;
  capability: string;
  close(): Promise<void>;
}

export interface RunnerGatewayOptions {
  credential: () => Promise<RunnerCredential>;
  model: string;
  maxRequests: number;
  maxTokens: number;
  /** Dependency injection for tests; the action never accepts a configurable upstream. */
  request?: typeof fetch;
  host?: string;
}

const MAX_BODY = 4 * 1024 * 1024;
const MAX_RESPONSE = 32 * 1024 * 1024;

function authenticated(request: IncomingMessage, capability: string): boolean {
  const actual = Buffer.from(request.headers.authorization ?? '');
  const expected = Buffer.from(`Bearer ${capability}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function fail(response: ServerResponse, status: number, message: string): void {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message } }));
}

/** Fixed-upstream, bounded host gateway; clients never choose upstream authentication. */
export async function startRunnerGateway(options: RunnerGatewayOptions): Promise<RunnerGateway> {
  if (
    !Number.isSafeInteger(options.maxRequests) ||
    options.maxRequests < 1 ||
    !Number.isSafeInteger(options.maxTokens) ||
    options.maxTokens < 1 ||
    !options.model
  ) {
    throw new Error('Invalid gateway limits.');
  }
  const capability = randomBytes(32).toString('hex');
  let requests = 0;
  let closed = false;
  const active = new Set<AbortController>();
  const server = createServer((req, res) => {
    void (async () => {
      if (closed || !authenticated(req, capability)) {
        fail(res, 401, 'Unauthorized gateway request.');
        return;
      }
      // An exact path list also rejects absolute URLs, redirects, and arbitrary proxy targets.
      if (
        req.method !== 'POST' ||
        ![
          '/v1/messages',
          '/v1/messages?beta=true',
          '/v1/messages/count_tokens',
          '/v1/messages/count_tokens?beta=true',
        ].includes(req.url ?? '')
      ) {
        fail(res, 403, 'Gateway route is not allowed.');
        return;
      }
      if (++requests > options.maxRequests) {
        fail(res, 429, 'This job has exhausted its model request limit.');
        return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > MAX_BODY) {
          fail(res, 413, 'Model request is too large.');
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let value: unknown;
      try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        fail(res, 400, 'Invalid model request.');
        return;
      }
      if (
        typeof value !== 'object' ||
        value === null ||
        !('model' in value) ||
        value.model !== options.model
      ) {
        fail(res, 403, 'Model is not allowed for this job.');
        return;
      }
      if (
        !req.url!.includes('/count_tokens') &&
        (!('max_tokens' in value) ||
          !Number.isSafeInteger(value.max_tokens) ||
          (value.max_tokens as number) < 1 ||
          (value.max_tokens as number) > options.maxTokens)
      ) {
        fail(res, 400, 'Requested output exceeds the per-request token limit.');
        return;
      }
      const controller = new AbortController();
      active.add(controller);
      const abort = () => controller.abort();
      res.once('close', abort);
      try {
        const credential = await options.credential();
        const headers = new Headers({
          'content-type': 'application/json',
          'anthropic-version': '2023-06-01',
        });
        // Only API feature flags are forwarded. Client authentication, host, cookies, and
        // forwarding headers are never sent upstream.
        const beta = req.headers['anthropic-beta'];
        if (typeof beta === 'string' && beta.length <= 2048) headers.set('anthropic-beta', beta);
        for (const [key, val] of Object.entries(credential.headers)) {
          if (key.toLowerCase() === 'anthropic-beta' && headers.has(key)) {
            headers.set(key, `${headers.get(key)},${val}`);
          } else headers.set(key, val);
        }
        const upstream = await (options.request ?? fetch)(`https://api.anthropic.com${req.url}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(value),
          redirect: 'error',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(600_000)]),
        });
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          fail(
            res,
            upstream.status >= 400 ? upstream.status : 502,
            'Upstream model request failed.',
          );
          return;
        }
        res.writeHead(200, {
          'content-type': upstream.headers.get('content-type')?.includes('text/event-stream')
            ? 'text/event-stream'
            : 'application/json',
          'cache-control': 'no-store',
        });
        let responseBytes = 0;
        for await (const chunk of upstream.body) {
          responseBytes += chunk.length;
          if (responseBytes > MAX_RESPONSE) throw new Error('Response limit exceeded.');
          if (!res.write(chunk)) {
            await new Promise<void>((resolve, reject) => {
              const cleanup = () => {
                res.off('drain', drain);
                res.off('close', close);
              };
              const drain = () => {
                cleanup();
                resolve();
              };
              const close = () => {
                cleanup();
                reject(new Error('Client closed.'));
              };
              res.once('drain', drain);
              res.once('close', close);
            });
          }
        }
        res.end();
      } finally {
        controller.abort();
        active.delete(controller);
        res.off('close', abort);
      }
    })().catch(() => fail(res, 502, 'Gateway request failed.'));
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.maxHeadersCount = 32;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, options.host ?? '0.0.0.0', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Gateway did not bind a port.');
  return {
    port: address.port,
    capability,
    async close() {
      closed = true;
      for (const controller of active) controller.abort();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
