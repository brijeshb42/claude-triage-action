export interface SandboxEnvironment {
  apiUrl: string;
  apiKey: string;
  sandboxId: string;
  nodeBinPath?: string;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function loadSandboxEnvironment(): SandboxEnvironment {
  const nodeBinPath = process.env.SANDBOX_NODE_BIN;
  return {
    apiUrl: requiredEnvironmentVariable('SANDBOX_API_URL'),
    apiKey: requiredEnvironmentVariable('SANDBOX_API_KEY'),
    sandboxId: requiredEnvironmentVariable('SANDBOX_ID'),
    ...(nodeBinPath ? { nodeBinPath } : {}),
  };
}

export function loadBridgeEnvironment(): Omit<SandboxEnvironment, 'sandboxId'> {
  return {
    apiUrl: requiredEnvironmentVariable('SANDBOX_API_URL'),
    apiKey: requiredEnvironmentVariable('SANDBOX_API_KEY'),
  };
}
