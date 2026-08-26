export interface SandboxEnvironment {
  apiUrl: string;
  apiKey: string;
  sandboxId: string;
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function loadSandboxEnvironment(): SandboxEnvironment {
  return {
    apiUrl: requiredEnvironmentVariable('SANDBOX_API_URL'),
    apiKey: requiredEnvironmentVariable('SANDBOX_API_KEY'),
    sandboxId: requiredEnvironmentVariable('SANDBOX_ID'),
  };
}

export function loadBridgeEnvironment(): Omit<SandboxEnvironment, 'sandboxId'> {
  return {
    apiUrl: requiredEnvironmentVariable('SANDBOX_API_URL'),
    apiKey: requiredEnvironmentVariable('SANDBOX_API_KEY'),
  };
}
