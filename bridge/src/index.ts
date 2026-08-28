import { getSandboxBridgeAdapter } from './adapters/registry';

function providerError(error: unknown): Response {
  return Response.json(
    {
      error: error instanceof Error ? error.message : String(error),
      code: 'sandbox_provider_unavailable',
    },
    { status: 503 },
  );
}

export default {
  async fetch(request, environment, context): Promise<Response> {
    try {
      return await getSandboxBridgeAdapter(environment).fetch(request, environment, context);
    } catch (error) {
      return providerError(error);
    }
  },
  async scheduled(controller, environment, context): Promise<void> {
    const adapter = getSandboxBridgeAdapter(environment);
    await adapter.scheduled?.(controller, environment, context);
  },
} satisfies ExportedHandler<Env>;
