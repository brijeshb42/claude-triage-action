import { bridge } from '@cloudflare/sandbox/bridge';

export { Sandbox } from '@cloudflare/sandbox';
export { WarmPool } from '@cloudflare/sandbox/bridge';

export default bridge({
  async fetch(): Promise<Response> {
    return new Response('Claude triage Sandbox Bridge');
  },
});
