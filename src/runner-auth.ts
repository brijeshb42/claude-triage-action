export interface RunnerCredential {
  headers: Record<string, string>;
}

/** Host-only authentication. No credential value may enter Docker arguments or logs. */
export function createRunnerCredentialProvider(
  environment: NodeJS.ProcessEnv,
  request: typeof fetch = fetch,
): () => Promise<RunnerCredential> {
  const value = (name: string) => environment[name]?.trim() || '';
  const apiKey = value('RUNNER_ANTHROPIC_API_KEY');
  const federationRule = value('RUNNER_FEDERATION_RULE_ID');
  const organization = value('RUNNER_ORGANIZATION_ID');
  const serviceAccount = value('RUNNER_SERVICE_ACCOUNT_ID');
  const workspace = value('RUNNER_WORKSPACE_ID');
  const federation = Boolean(federationRule || organization || serviceAccount || workspace);
  if (apiKey && federation) {
    throw new Error('Configure either an Anthropic API key or federation, not both.');
  }
  if (apiKey) {
    if (/[\r\n]/u.test(apiKey)) throw new Error('Invalid Anthropic API key.');
    return async () => ({ headers: { 'x-api-key': apiKey } });
  }
  if (!federationRule || !organization) {
    throw new Error(
      'Anthropic authentication requires an API key or federation rule and organization.',
    );
  }

  let identityUrl: URL;
  try {
    identityUrl = new URL(value('ACTIONS_ID_TOKEN_REQUEST_URL'));
  } catch {
    throw new Error('GitHub OIDC is unavailable; the job requires id-token: write.');
  }
  if (
    identityUrl.protocol !== 'https:' ||
    !identityUrl.hostname.endsWith('.actions.githubusercontent.com') ||
    identityUrl.username ||
    identityUrl.password ||
    (identityUrl.port && identityUrl.port !== '443') ||
    identityUrl.hash
  ) {
    throw new Error('GitHub OIDC request URL must use a trusted GitHub Actions HTTPS endpoint.');
  }
  const identityRequestToken = value('ACTIONS_ID_TOKEN_REQUEST_TOKEN');
  if (!identityRequestToken || /[\r\n]/u.test(identityRequestToken)) {
    throw new Error('GitHub OIDC is unavailable; the job requires id-token: write.');
  }
  identityUrl.searchParams.set('audience', 'https://api.anthropic.com');

  // Keep responses, including error bodies that may echo credentials, out of logs.
  async function jsonRequest(url: string, init: RequestInit, label: string) {
    try {
      const response = await request(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error();
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error();
      const chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        length += chunk.byteLength;
        if (length > 1024 * 1024) {
          await reader.cancel();
          throw new Error();
        }
        chunks.push(chunk);
      }
      const result: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
      return result as Record<string, unknown>;
    } catch {
      throw new Error(`${label} failed; credentials and response content are withheld.`);
    }
  }

  let cached: { credential: RunnerCredential; refreshAt: number } | undefined;
  let pending: Promise<RunnerCredential> | undefined;
  async function exchange(): Promise<RunnerCredential> {
    // Every exchange gets a new single-use GitHub JWT. Never retry an assertion.
    const identity = await jsonRequest(
      identityUrl.href,
      { headers: { Authorization: `Bearer ${identityRequestToken}` } },
      'GitHub OIDC request',
    );
    if (
      typeof identity.value !== 'string' ||
      !identity.value ||
      identity.value.length > 16 * 1024
    ) {
      throw new Error('GitHub OIDC returned an invalid identity token.');
    }
    const issuedAt = Date.now();
    const token = await jsonRequest(
      'https://api.anthropic.com/v1/oauth/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-beta': 'oauth-2025-04-20,oidc-federation-2026-04-01',
          'User-Agent': 'claude-triage-runner',
        },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: identity.value,
          federation_rule_id: federationRule,
          organization_id: organization,
          ...(serviceAccount ? { service_account_id: serviceAccount } : {}),
          ...(workspace ? { workspace_id: workspace } : {}),
        }),
      },
      'Anthropic federation exchange',
    );
    if (
      typeof token.access_token !== 'string' ||
      !token.access_token ||
      /[\r\n]/u.test(token.access_token) ||
      typeof token.token_type !== 'string' ||
      token.token_type.toLowerCase() !== 'bearer' ||
      typeof token.expires_in !== 'number' ||
      !Number.isFinite(token.expires_in) ||
      token.expires_in <= 0
    ) {
      throw new Error('Anthropic federation returned an invalid access token response.');
    }
    const credential = {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'anthropic-beta': 'oauth-2025-04-20',
      },
    };
    const skew = Math.min(60, token.expires_in / 10);
    const refreshAt = issuedAt + (token.expires_in - skew) * 1000;
    if (refreshAt <= Date.now())
      throw new Error('Anthropic federation returned an expired access token.');
    cached = { credential, refreshAt };
    return credential;
  }

  return async () => {
    if (cached && Date.now() < cached.refreshAt)
      return { headers: { ...cached.credential.headers } };
    pending ??= exchange().finally(() => {
      pending = undefined;
    });
    const credential = await pending;
    return { headers: { ...credential.headers } };
  };
}
