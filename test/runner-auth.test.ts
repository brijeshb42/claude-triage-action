import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunnerCredentialProvider } from '../src/runner-auth.js';

const federation = {
  RUNNER_FEDERATION_RULE_ID: 'fdrl_test',
  RUNNER_ORGANIZATION_ID: 'organization',
  ACTIONS_ID_TOKEN_REQUEST_URL:
    'https://run-actions-1.actions.githubusercontent.com/token?api-version=2',
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'host-only-github-secret',
};

test('API key credentials do not make network requests', async () => {
  const provider = createRunnerCredentialProvider(
    { RUNNER_ANTHROPIC_API_KEY: 'key-secret' },
    async () => {
      throw new Error('unexpected fetch');
    },
  );
  assert.deepEqual(await provider(), { headers: { 'x-api-key': 'key-secret' } });
});

test('rejects missing, partial, ambiguous authentication and untrusted OIDC endpoints', () => {
  for (const environment of [
    {},
    { RUNNER_FEDERATION_RULE_ID: 'fdrl_test' },
    { RUNNER_WORKSPACE_ID: 'workspace' },
    { ...federation, RUNNER_ANTHROPIC_API_KEY: 'secret' },
    { ...federation, ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
  ])
    assert.throws(() => createRunnerCredentialProvider(environment));
  for (const url of [
    'http://run.actions.githubusercontent.com/token',
    'https://attacker.example/token',
    'https://actions.githubusercontent.com.attacker.example/token',
    'https://user:pass@run.actions.githubusercontent.com/token',
    'https://run.actions.githubusercontent.com:444/token',
    'file:///tmp/token',
  ])
    assert.throws(() =>
      createRunnerCredentialProvider({ ...federation, ACTIONS_ID_TOKEN_REQUEST_URL: url }),
    );
});

test('federation exchanges exact fields and headers, caches and serializes refreshes', async (t) => {
  let now = 1_000_000;
  t.mock.method(Date, 'now', () => now);
  const calls: { url: string; init: RequestInit }[] = [];
  let identities = 0;
  const fakeFetch: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes('actions.githubusercontent.com')) {
      identities++;
      return Response.json({ value: `identity-${identities}` });
    }
    return Response.json({
      access_token: `access-${identities}`,
      token_type: 'Bearer',
      expires_in: 600,
    });
  };
  const provider = createRunnerCredentialProvider(
    {
      ...federation,
      RUNNER_SERVICE_ACCOUNT_ID: 'svac_test',
      RUNNER_WORKSPACE_ID: 'default',
    },
    fakeFetch,
  );
  const credentials = await Promise.all([provider(), provider(), provider()]);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[0]!.url).searchParams.get('audience'), 'https://api.anthropic.com');
  assert.equal(
    new Headers(calls[0]!.init.headers).get('Authorization'),
    'Bearer host-only-github-secret',
  );
  assert.equal(calls[1]!.url, 'https://api.anthropic.com/v1/oauth/token');
  assert.equal(calls[1]!.init.method, 'POST');
  assert.equal(
    new Headers(calls[1]!.init.headers).get('anthropic-beta'),
    'oauth-2025-04-20,oidc-federation-2026-04-01',
  );
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), {
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: 'identity-1',
    federation_rule_id: 'fdrl_test',
    organization_id: 'organization',
    service_account_id: 'svac_test',
    workspace_id: 'default',
  });
  for (const call of calls) {
    assert.equal(call.init.redirect, 'error');
    assert.ok(call.init.signal instanceof AbortSignal);
  }
  assert.deepEqual(credentials[0], {
    headers: { Authorization: 'Bearer access-1', 'anthropic-beta': 'oauth-2025-04-20' },
  });
  credentials[0]!.headers.Authorization = 'mutated';
  assert.equal((await provider()).headers.Authorization, 'Bearer access-1');
  now += 539_000;
  await provider();
  assert.equal(calls.length, 2);
  now += 1_000;
  await Promise.all([provider(), provider()]);
  assert.equal(calls.length, 4);
  assert.equal(JSON.parse(String(calls[3]!.init.body)).assertion, 'identity-2');
  assert.equal((await provider()).headers.Authorization, 'Bearer access-2');
});

test('authentication failures are sanitized and failed exchange can be retried with fresh identity', async () => {
  let identities = 0;
  let exchanges = 0;
  const provider = createRunnerCredentialProvider(federation, async (input) => {
    if (String(input).includes('actions.githubusercontent.com')) {
      identities++;
      return Response.json({ value: `secret-identity-${identities}` });
    }
    exchanges++;
    if (exchanges === 1)
      return new Response('secret-identity-1 host-only-github-secret', { status: 401 });
    return Response.json({ access_token: 'new-access', token_type: 'Bearer', expires_in: 60 });
  });
  await assert.rejects(provider(), (error: Error) => {
    assert.match(error.message, /Anthropic federation exchange failed/);
    assert.doesNotMatch(error.message, /secret|identity-1/);
    return true;
  });
  assert.equal((await provider()).headers.Authorization, 'Bearer new-access');
  assert.equal(identities, 2);
});

test('network exceptions, malformed tokens and oversized responses cannot leak secrets', async () => {
  for (const response of [
    () => {
      throw new Error('host-only-github-secret');
    },
    () => new Response('host-only-github-secret'),
    () => Response.json({ value: 'secret'.repeat(3000) }),
    () => Response.json({ access_token: 'secret-access', token_type: 'Basic', expires_in: 600 }),
    () => Response.json({ access_token: 'secret-access', token_type: 'Bearer', expires_in: -1 }),
    () => new Response('secret'.repeat(200_000)),
  ]) {
    let count = 0;
    const provider = createRunnerCredentialProvider(federation, async () => {
      count++;
      if (count === 1) return Response.json({ value: 'identity' });
      return response();
    });
    await assert.rejects(provider(), (error: Error) => {
      assert.doesNotMatch(error.message, /secret|identity/);
      return true;
    });
  }
});

test('OIDC errors and malformed identity tokens are sanitized before exchange', async () => {
  for (const response of [
    () => {
      throw new Error('host-only-github-secret');
    },
    () => new Response('host-only-github-secret', { status: 403 }),
    () => Response.json({ value: '' }),
    () => Response.json({ value: 'secret'.repeat(3000) }),
  ]) {
    let count = 0;
    const provider = createRunnerCredentialProvider(federation, async () => {
      count++;
      return response();
    });
    await assert.rejects(provider(), (error: Error) => {
      assert.doesNotMatch(error.message, /secret/);
      return true;
    });
    assert.equal(count, 1);
  }
});
