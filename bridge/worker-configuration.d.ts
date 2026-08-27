interface Env {
  [key: string]: unknown;
  Sandbox: DurableObjectNamespace;
  WarmPool: DurableObjectNamespace;
  SANDBOX_API_KEY: string;
  SANDBOX_PROVIDER: string;
  SANDBOX_TRANSPORT: string;
  WARM_POOL_TARGET: string;
  WARM_POOL_REFRESH_INTERVAL: string;
  WARM_POOL_MAX_INSTANCES: string;
  WARM_POOL_SCALE_BATCH_SIZE: string;
}
