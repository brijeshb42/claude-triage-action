import { cloudflareSandboxAdapter } from './cloudflare';
import type { SandboxBridgeAdapter } from './types';

export function resolveSandboxProvider(value: string | undefined): string {
  return value?.trim().toLowerCase() || 'cloudflare';
}

export function getSandboxBridgeAdapter(environment: Env): SandboxBridgeAdapter<Env> {
  const provider = resolveSandboxProvider(environment.SANDBOX_PROVIDER);
  if (provider === cloudflareSandboxAdapter.provider) {
    return cloudflareSandboxAdapter;
  }
  throw new Error(`Unsupported sandbox provider: ${JSON.stringify(provider)}.`);
}
