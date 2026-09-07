import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test, type TestContext } from 'node:test';
import {
  startRunnerGateway,
  type RunnerGateway,
  type RunnerGatewayOptions,
} from '../src/runner-gateway.js';

const model = 'claude-test-model';
const validBody = { model, max_tokens: 100, messages: [{ role: 'user', content: 'hello' }] };

async function setup(t: TestContext, overrides: Partial<RunnerGatewayOptions> = {}) {
  const gateway = await startRunnerGateway({
    model,
    maxTokens: 100,
    maxRequests: 20,
    host: '127.0.0.1',
    credential: async () => ({ headers: { 'x-api-key': 'upstream-secret' } }),
    request: async () => Response.json({ content: [] }),
    ...overrides,
  });
  t.after(() => gateway.close());
  return gateway;
}

function send(
  gateway: RunnerGateway,
  body: unknown = validBody,
  path = '/v1/messages',
  headers: Record<string, string> = {},
) {
  return fetch(`http://127.0.0.1:${gateway.port}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${gateway.capability}`,
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('gateway rejects authentication and routes before acquiring credentials', async (t) => {
  let credentials = 0;
  const gateway = await setup(t, {
    credential: async () => {
      credentials++;
      throw new Error('unexpected');
    },
  });
  for (const authorization of ['', 'Bearer wrong', `Basic ${gateway.capability}`]) {
    assert.equal(
      (await send(gateway, validBody, '/v1/messages', { Authorization: authorization })).status,
      401,
    );
  }
  for (const path of [
    '/v1/oauth/token',
    '/v1/messages?host=evil',
    '/v1/messages/',
    '/v1/messages?beta=false',
    '/v1/%6dessages',
  ]) {
    assert.equal((await send(gateway, validBody, path)).status, 403);
  }
  for (const method of ['GET', 'DELETE', 'OPTIONS']) {
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${gateway.port}/v1/messages`, {
          method,
          headers: { Authorization: `Bearer ${gateway.capability}` },
        })
      ).status,
      403,
    );
  }
  const absoluteStatus = await new Promise<number>((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port: gateway.port,
        path: 'https://attacker.example/v1/messages',
        method: 'POST',
        headers: { Authorization: `Bearer ${gateway.capability}` },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    request.on('error', reject);
    request.end(JSON.stringify(validBody));
  });
  assert.equal(absoluteStatus, 403);
  assert.equal(credentials, 0);
});

test('gateway forwards only exact routes to fixed upstream and replaces client credentials', async (t) => {
  const calls: { input: string; options: RequestInit }[] = [];
  const gateway = await setup(t, {
    credential: async () => ({
      headers: { Authorization: 'Bearer upstream-oauth', 'anthropic-beta': 'oauth-2025-04-20' },
    }),
    request: async (input, options = {}) => {
      calls.push({ input: String(input), options });
      return Response.json(
        { content: [] },
        { headers: { 'set-cookie': 'upstream-secret-cookie' } },
      );
    },
  });
  for (const path of [
    '/v1/messages',
    '/v1/messages?beta=true',
    '/v1/messages/count_tokens',
    '/v1/messages/count_tokens?beta=true',
  ]) {
    const body = path.includes('count_tokens') ? { model, messages: [] } : validBody;
    const response = await send(gateway, body, path, {
      'x-api-key': 'client-secret',
      cookie: 'client-cookie',
      'x-forwarded-host': 'evil.example',
      'anthropic-version': 'evil-version',
      'anthropic-beta': 'feature-beta',
      'x-arbitrary-secret': 'client-secret',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    await response.text();
    const call = calls.at(-1)!;
    assert.equal(call.input, `https://api.anthropic.com${path}`);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal instanceof AbortSignal);
    assert.deepEqual(Object.fromEntries(new Headers(call.options.headers)), {
      'anthropic-beta': 'feature-beta,oauth-2025-04-20',
      'anthropic-version': '2023-06-01',
      authorization: 'Bearer upstream-oauth',
      'content-type': 'application/json',
    });
    assert.deepEqual(JSON.parse(String(call.options.body)), body);
  }
});

test('gateway enforces model, tokens, JSON and body size before authentication upstream', async (t) => {
  let upstream = 0;
  const gateway = await setup(t, {
    request: async () => {
      upstream++;
      return Response.json({});
    },
  });
  for (const body of [null, [], {}, { ...validBody, model: 'other-model' }]) {
    assert.equal((await send(gateway, body)).status, 403);
  }
  for (const max_tokens of [undefined, 0, -1, 101, 1.5, '10']) {
    assert.equal((await send(gateway, { ...validBody, max_tokens })).status, 400);
  }
  assert.equal((await send(gateway, '{invalid-json')).status, 400);
  const oversized = JSON.stringify({ ...validBody, padding: 'x'.repeat(4 * 1024 * 1024) });
  assert.equal((await send(gateway, oversized)).status, 413);
  assert.equal(upstream, 0);
});

test('gateway counts accepted route attempts and stops at the job request limit', async (t) => {
  let upstream = 0;
  const gateway = await setup(t, {
    maxRequests: 2,
    request: async () => {
      upstream++;
      return Response.json({});
    },
  });
  assert.equal(
    (await send(gateway, validBody, '/v1/messages', { Authorization: 'wrong' })).status,
    401,
  );
  assert.equal((await send(gateway, '{malformed')).status, 400);
  assert.equal((await send(gateway)).status, 200);
  assert.equal((await send(gateway)).status, 429);
  assert.equal(upstream, 1);
});

test('gateway forwards streaming SSE incrementally', async (t) => {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const gateway = await setup(t, {
    request: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(encoder.encode('event: message_start\ndata: {}\n\n'));
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  });
  const response = await send(gateway);
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body!.getReader();
  assert.equal(
    new TextDecoder().decode((await reader.read()).value),
    'event: message_start\ndata: {}\n\n',
  );
  streamController.enqueue(encoder.encode('event: message_stop\ndata: {}\n\n'));
  streamController.close();
  assert.equal(
    new TextDecoder().decode((await reader.read()).value),
    'event: message_stop\ndata: {}\n\n',
  );
  assert.equal((await reader.read()).done, true);
});

test('gateway sanitizes upstream and credential errors', async (t) => {
  for (const kind of ['response', 'fetch', 'credential']) {
    const gateway = await setup(t, {
      credential: async () => {
        if (kind === 'credential') throw new Error('secret-credential');
        return { headers: { 'x-api-key': 'secret-key' } };
      },
      request: async () => {
        if (kind === 'fetch') throw new Error('secret-upstream');
        return new Response('secret-upstream-body', { status: 401 });
      },
    });
    const response = await send(gateway);
    assert.equal(response.status, kind === 'response' ? 401 : 502);
    assert.doesNotMatch(await response.text(), /secret/);
  }
});

test('closing gateway aborts active upstream requests and disconnects clients', async () => {
  let upstreamStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    upstreamStarted = resolve;
  });
  let upstreamSignal: AbortSignal | undefined;
  const gateway = await startRunnerGateway({
    model,
    maxTokens: 100,
    maxRequests: 1,
    host: '127.0.0.1',
    credential: async () => ({ headers: { 'x-api-key': 'secret' } }),
    request: async (_input, options) => {
      upstreamSignal = options?.signal ?? undefined;
      upstreamStarted();
      return new Promise<Response>((_resolve, reject) => {
        upstreamSignal!.addEventListener('abort', () => reject(new Error('aborted')), {
          once: true,
        });
      });
    },
  });
  const client = send(gateway).then(
    () => 'resolved',
    () => 'disconnected',
  );
  await started;
  await gateway.close();
  assert.equal(upstreamSignal?.aborted, true);
  assert.equal(await client, 'disconnected');
  await assert.rejects(fetch(`http://127.0.0.1:${gateway.port}/v1/messages`));
});
