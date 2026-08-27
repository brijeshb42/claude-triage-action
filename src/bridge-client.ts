export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  maxOutputChars?: number;
}

interface ParsedSseEvent {
  event: string;
  data: string;
}

function appendWithLimit(
  current: string,
  addition: string,
  limit: number,
): { value: string; truncated: boolean } {
  if (current.length >= limit) {
    return { value: current, truncated: addition.length > 0 };
  }

  const remaining = limit - current.length;
  if (addition.length <= remaining) {
    return { value: current + addition, truncated: false };
  }

  return { value: current + addition.slice(0, remaining), truncated: true };
}

function parseEvents(payload: string): ParsedSseEvent[] {
  return payload
    .split(/\r?\n\r?\n/)
    .map((block) => {
      let event = '';
      const data: string[] = [];

      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('event:')) {
          event = line.slice('event:'.length).trim();
        } else if (line.startsWith('data:')) {
          data.push(line.slice('data:'.length).trimStart());
        }
      }

      return { event, data: data.join('\n') };
    })
    .filter((entry) => entry.event.length > 0);
}

function encodeFilePath(filePath: string): string {
  return filePath
    .replace(/^\/+/, '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function parseExecSse(payload: string, maxOutputChars = 100_000): ExecResult {
  let stdout = '';
  let stderr = '';
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let exitCode: number | undefined;

  for (const entry of parseEvents(payload)) {
    if (entry.event === 'stdout' || entry.event === 'stderr') {
      const decoded = Buffer.from(entry.data, 'base64').toString('utf8');
      if (entry.event === 'stdout') {
        const appended = appendWithLimit(stdout, decoded, maxOutputChars);
        stdout = appended.value;
        stdoutTruncated ||= appended.truncated;
      } else {
        const appended = appendWithLimit(stderr, decoded, maxOutputChars);
        stderr = appended.value;
        stderrTruncated ||= appended.truncated;
      }
      continue;
    }

    if (entry.event === 'exit') {
      const value: unknown = JSON.parse(entry.data);
      if (
        typeof value !== 'object' ||
        value === null ||
        !('exit_code' in value) ||
        typeof value.exit_code !== 'number'
      ) {
        throw new Error('Sandbox Bridge returned an invalid exit event.');
      }
      exitCode = value.exit_code;
      continue;
    }

    if (entry.event === 'error') {
      const value: unknown = JSON.parse(entry.data);
      const message =
        typeof value === 'object' && value !== null && 'error' in value
          ? String(value.error)
          : entry.data;
      throw new Error(`Sandbox command failed: ${message}`);
    }
  }

  if (exitCode === undefined) {
    throw new Error('Sandbox Bridge command stream ended without an exit event.');
  }

  return { exitCode, stdout, stderr, stdoutTruncated, stderrTruncated };
}

export class SandboxBridgeClient {
  readonly #apiUrl: URL;
  readonly #apiKey: string;

  constructor(apiUrl: string, apiKey: string) {
    this.#apiUrl = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
    if (this.#apiUrl.protocol !== 'https:' && this.#apiUrl.hostname !== 'localhost') {
      throw new Error('Sandbox Bridge URL must use HTTPS outside localhost.');
    }
    if (!apiKey) {
      throw new Error('Sandbox Bridge API key is required.');
    }
    this.#apiKey = apiKey;
  }

  async #request(relativePath: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.#apiKey}`);

    const response = await fetch(new URL(relativePath, this.#apiUrl), { ...init, headers });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 4_000);
      throw new Error(
        `Sandbox Bridge request failed: ${init.method ?? 'GET'} ${relativePath} ` +
          `returned ${response.status}: ${body}`,
      );
    }
    return response;
  }

  async create(): Promise<string> {
    const response = await this.#request('v1/sandbox', { method: 'POST' });
    const value: unknown = await response.json();
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      typeof value.id !== 'string' ||
      !value.id
    ) {
      throw new Error('Sandbox Bridge returned an invalid sandbox ID.');
    }
    return value.id;
  }

  async destroy(sandboxId: string): Promise<void> {
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}`, { method: 'DELETE' });
  }

  async readFile(sandboxId: string, filePath: string): Promise<string> {
    const relativePath = encodeFilePath(filePath);
    const response = await this.#request(
      `v1/sandbox/${encodeURIComponent(sandboxId)}/file/${relativePath}`,
    );
    return response.text();
  }

  async writeFile(
    sandboxId: string,
    filePath: string,
    content: string | Uint8Array,
  ): Promise<void> {
    const relativePath = encodeFilePath(filePath);
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/file/${relativePath}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: typeof content === 'string' ? content : new Uint8Array(content).buffer,
    });
  }

  async exec(sandboxId: string, argv: string[], options: ExecOptions = {}): Promise<ExecResult> {
    const response = await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        argv,
        cwd: options.cwd ?? '/workspace/repo',
        timeout_ms: options.timeoutMs ?? 120_000,
      }),
    });
    return parseExecSse(await response.text(), options.maxOutputChars);
  }
}
