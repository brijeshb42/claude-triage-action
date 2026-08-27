import { bridge } from '@cloudflare/sandbox/bridge';
import type { SandboxBridgeAdapter } from './types';

const cloudflareBridge = bridge({
  async fetch(): Promise<Response> {
    return new Response('Claude triage Sandbox Bridge');
  },
});

export const cloudflareSandboxAdapter: SandboxBridgeAdapter<Env> = {
  provider: 'cloudflare',
  async fetch(request, environment, context) {
    if (!cloudflareBridge.fetch) {
      throw new Error('The Cloudflare Sandbox Bridge does not expose a fetch handler.');
    }
    return cloudflareBridge.fetch(request, environment, context);
  },
  async scheduled(controller, environment, context) {
    await cloudflareBridge.scheduled?.(controller, environment, context);
  },
};
