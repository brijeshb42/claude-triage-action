import { spawn } from 'node:child_process';
import type { Readable } from 'node:stream';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Bound memory and time; never print child output as GitHub workflow commands. */
export async function runProcess(
  command: string,
  args: string[],
  options: {
    input?: string | Readable;
    timeoutMs?: number;
    maxBytes?: number;
    signal?: AbortSignal;
    cwd?: string;
  } = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) throw new Error('Runner process was cancelled.');
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(options.cwd ? { cwd: options.cwd } : {}),
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let size = 0;
    let failure: Error | undefined;
    const stop = (message: string) => {
      failure ??= new Error(message);
      child.kill('SIGKILL');
    };
    const abort = () => stop('Runner process was cancelled.');
    const timer = setTimeout(
      () => stop('Runner process exceeded its deadline.'),
      options.timeoutMs ?? 120_000,
    );
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const collect = (destination: Buffer[]) => (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) stop('Runner process exceeded its output limit.');
      else destination.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.stdin.on('error', () => {
      /* A failed/aborted command may close input early. */
    });
    if (typeof options.input === 'string') child.stdin.end(options.input);
    else if (options.input) {
      options.input.once('error', () => stop('Could not read runner process input.'));
      options.input.pipe(child.stdin);
    } else child.stdin.end();
    child.once('error', () => {
      failure = new Error(`Could not start ${command}.`);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (typeof options.input === 'object') options.input.destroy();
      if (failure) reject(failure);
      else
        resolve({
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          exitCode: code ?? 1,
        });
    });
  });
}
