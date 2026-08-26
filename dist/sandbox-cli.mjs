#!/usr/bin/env node

// src/sandbox-cli.ts
import { readFile as readFile2, writeFile } from "node:fs/promises";
import * as path2 from "node:path";

// src/archive.ts
import { execFile, spawn } from "node:child_process";
import { lstat, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
var TARGET_CHUNK_BYTES = 20 * 1024 * 1024;
var MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
function estimatedTarBytes(file) {
  const contentBlocks = Math.ceil(file.size / 512) * 512;
  return contentBlocks + 1536;
}
function planArchiveChunks(files, targetBytes = TARGET_CHUNK_BYTES) {
  const chunks = [];
  let current = [];
  let currentBytes = 1024;
  for (const file of files) {
    const estimate = estimatedTarBytes(file);
    if (estimate > MAX_ARCHIVE_BYTES) {
      throw new Error(
        `Tracked file ${JSON.stringify(file.name)} is too large for Bridge hydration (${file.size} bytes).`
      );
    }
    if (current.length > 0 && currentBytes + estimate > targetBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 1024;
    }
    current.push(file);
    currentBytes += estimate;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}
async function trackedFiles(repositoryDirectory) {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repositoryDirectory,
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024
  });
  const names = stdout.toString("utf8").split("\0").filter((name) => name.length > 0);
  return Promise.all(
    names.map(async (name) => {
      const metadata = await lstat(path.join(repositoryDirectory, name));
      if (metadata.isDirectory()) {
        throw new Error(
          `Tracked path ${JSON.stringify(name)} is a directory. Git submodules are not supported yet.`
        );
      }
      return { name, size: metadata.size };
    })
  );
}
async function createTar(archiveSourceDirectory, destination, files) {
  await new Promise((resolve2, reject) => {
    const tarProcess = spawn(
      "tar",
      ["--null", "--no-recursion", "--create", "--file", destination, "--files-from=-"],
      { cwd: archiveSourceDirectory, stdio: ["pipe", "inherit", "inherit"] }
    );
    tarProcess.once("error", reject);
    tarProcess.once("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve2();
      } else {
        reject(new Error(`tar exited with code ${exitCode ?? "unknown"}.`));
      }
    });
    tarProcess.stdin.end(`${files.map((file) => `repo/${file.name}`).join("\0")}\0`);
  });
}
async function createArchiveChunks(repositoryDirectory) {
  const files = await trackedFiles(repositoryDirectory);
  const plans = planArchiveChunks(files);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "claude-triage-archives-"));
  try {
    await symlink(repositoryDirectory, path.join(temporaryDirectory, "repo"), "dir");
    const chunks = [];
    for (const [index, plannedFiles] of plans.entries()) {
      const archivePath = path.join(temporaryDirectory, `chunk-${index}.tar`);
      await createTar(temporaryDirectory, archivePath, plannedFiles);
      const archiveStats = await stat(archivePath);
      if (archiveStats.size > MAX_ARCHIVE_BYTES) {
        throw new Error(
          `Archive chunk ${index + 1} exceeded the Bridge limit (${archiveStats.size} bytes).`
        );
      }
      chunks.push({ bytes: await readFile(archivePath), fileCount: plannedFiles.length });
    }
    return chunks;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

// src/bridge-client.ts
function appendWithLimit(current, addition, limit) {
  if (current.length >= limit) {
    return { value: current, truncated: addition.length > 0 };
  }
  const remaining = limit - current.length;
  if (addition.length <= remaining) {
    return { value: current + addition, truncated: false };
  }
  return { value: current + addition.slice(0, remaining), truncated: true };
}
function parseEvents(payload) {
  return payload.split(/\r?\n\r?\n/).map((block) => {
    let event = "";
    const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice("data:".length).trimStart());
      }
    }
    return { event, data: data.join("\n") };
  }).filter((entry) => entry.event.length > 0);
}
function encodeFilePath(filePath) {
  return filePath.replace(/^\/+/, "").split("/").map((segment) => encodeURIComponent(segment)).join("/");
}
function parseExecSse(payload, maxOutputChars = 1e5) {
  let stdout = "";
  let stderr = "";
  let stdoutTruncated = false;
  let stderrTruncated = false;
  let exitCode;
  for (const entry of parseEvents(payload)) {
    if (entry.event === "stdout" || entry.event === "stderr") {
      const decoded = Buffer.from(entry.data, "base64").toString("utf8");
      if (entry.event === "stdout") {
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
    if (entry.event === "exit") {
      const value = JSON.parse(entry.data);
      if (typeof value !== "object" || value === null || !("exit_code" in value) || typeof value.exit_code !== "number") {
        throw new Error("Sandbox Bridge returned an invalid exit event.");
      }
      exitCode = value.exit_code;
      continue;
    }
    if (entry.event === "error") {
      const value = JSON.parse(entry.data);
      const message = typeof value === "object" && value !== null && "error" in value ? String(value.error) : entry.data;
      throw new Error(`Sandbox command failed: ${message}`);
    }
  }
  if (exitCode === void 0) {
    throw new Error("Sandbox Bridge command stream ended without an exit event.");
  }
  return { exitCode, stdout, stderr, stdoutTruncated, stderrTruncated };
}
var SandboxBridgeClient = class {
  #apiUrl;
  #apiKey;
  constructor(apiUrl, apiKey) {
    this.#apiUrl = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
    if (this.#apiUrl.protocol !== "https:" && this.#apiUrl.hostname !== "localhost") {
      throw new Error("Sandbox Bridge URL must use HTTPS outside localhost.");
    }
    if (!apiKey) {
      throw new Error("Sandbox Bridge API key is required.");
    }
    this.#apiKey = apiKey;
  }
  async #request(relativePath, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.#apiKey}`);
    const response = await fetch(new URL(relativePath, this.#apiUrl), { ...init, headers });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 4e3);
      throw new Error(
        `Sandbox Bridge request failed: ${init.method ?? "GET"} ${relativePath} returned ${response.status}: ${body}`
      );
    }
    return response;
  }
  async create() {
    const response = await this.#request("v1/sandbox", { method: "POST" });
    const value = await response.json();
    if (typeof value !== "object" || value === null || !("id" in value) || typeof value.id !== "string" || !value.id) {
      throw new Error("Sandbox Bridge returned an invalid sandbox ID.");
    }
    return value.id;
  }
  async destroy(sandboxId) {
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}`, { method: "DELETE" });
  }
  async hydrate(sandboxId, archive) {
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/hydrate`, {
      method: "POST",
      body: new Uint8Array(archive).buffer
    });
  }
  async readFile(sandboxId, filePath) {
    const relativePath = encodeFilePath(filePath);
    const response = await this.#request(
      `v1/sandbox/${encodeURIComponent(sandboxId)}/file/${relativePath}`
    );
    return response.text();
  }
  async writeFile(sandboxId, filePath, content) {
    const relativePath = encodeFilePath(filePath);
    await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/file/${relativePath}`, {
      method: "PUT",
      body: content
    });
  }
  async exec(sandboxId, argv, options = {}) {
    const response = await this.#request(`v1/sandbox/${encodeURIComponent(sandboxId)}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        argv,
        cwd: options.cwd ?? "/workspace/repo",
        timeout_ms: options.timeoutMs ?? 12e4
      })
    });
    return parseExecSse(await response.text(), options.maxOutputChars);
  }
};

// src/config.ts
function requiredEnvironmentVariable(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
function loadBridgeEnvironment() {
  return {
    apiUrl: requiredEnvironmentVariable("SANDBOX_API_URL"),
    apiKey: requiredEnvironmentVariable("SANDBOX_API_KEY")
  };
}

// src/sandbox-cli.ts
function requiredArgument(value, description) {
  if (!value) {
    throw new Error(`Missing ${description}.`);
  }
  return value;
}
async function initializeRepository(client, sandboxId) {
  const commands = [
    ["git", "init", "-b", "claude-triage-base", "."],
    ["git", "config", "user.name", "Claude Triage"],
    ["git", "config", "user.email", "claude-triage@users.noreply.github.com"],
    ["git", "add", "--force", "."],
    ["git", "commit", "-m", "chore: sandbox baseline"]
  ];
  for (const argv of commands) {
    const result = await client.exec(sandboxId, argv, { timeoutMs: 3e5 });
    if (result.exitCode !== 0) {
      throw new Error(
        `Could not initialize sandbox repository with ${argv[0]}: ${result.stderr || result.stdout}`
      );
    }
  }
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const bridge = loadBridgeEnvironment();
  const client = new SandboxBridgeClient(bridge.apiUrl, bridge.apiKey);
  if (command === "create") {
    process.stdout.write(`${await client.create()}
`);
    return;
  }
  if (command === "destroy") {
    await client.destroy(requiredArgument(args[0], "sandbox ID"));
    return;
  }
  if (command === "hydrate-worktree") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const repositoryDirectory = path2.resolve(requiredArgument(args[1], "repository directory"));
    const chunks = await createArchiveChunks(repositoryDirectory);
    let uploadedFiles = 0;
    for (const [index, chunk] of chunks.entries()) {
      await client.hydrate(sandboxId, chunk.bytes);
      uploadedFiles += chunk.fileCount;
      process.stderr.write(
        `Hydrated chunk ${index + 1}/${chunks.length} (${chunk.fileCount} tracked files).
`
      );
    }
    await initializeRepository(client, sandboxId);
    process.stderr.write(
      `Hydrated ${uploadedFiles} tracked files and created a baseline commit.
`
    );
    return;
  }
  if (command === "export-patch") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const outputPath = path2.resolve(requiredArgument(args[1], "patch output path"));
    const stageResult = await client.exec(sandboxId, ["git", "add", "--all"], {
      timeoutMs: 12e4
    });
    if (stageResult.exitCode !== 0) {
      throw new Error(`Could not stage the sandbox patch: ${stageResult.stderr}`);
    }
    const result = await client.exec(
      sandboxId,
      ["git", "diff", "--cached", "--binary", "--no-ext-diff", "HEAD", "--"],
      { timeoutMs: 12e4, maxOutputChars: 16 * 1024 * 1024 }
    );
    if (result.exitCode !== 0 || result.stdoutTruncated) {
      throw new Error(
        `Could not export complete patch: ${result.stderr || "output was truncated"}`
      );
    }
    await writeFile(outputPath, result.stdout);
    return;
  }
  if (command === "upload-issue-context") {
    const sandboxId = requiredArgument(args[0], "sandbox ID");
    const inputPath = path2.resolve(requiredArgument(args[1], "issue context path"));
    await client.writeFile(sandboxId, "/workspace/issue.json", await readFile2(inputPath, "utf8"));
    return;
  }
  if (command === "mcp-config") {
    const serverPath = path2.resolve(requiredArgument(args[0], "MCP server path"));
    process.stdout.write(
      `${JSON.stringify({ mcpServers: { sandbox: { type: "stdio", command: "node", args: [serverPath] } } })}
`
    );
    return;
  }
  throw new Error(
    "Usage: sandbox-cli <create|destroy|hydrate-worktree|upload-issue-context|export-patch|mcp-config> [...args]"
  );
}
await main();
//# sourceMappingURL=sandbox-cli.mjs.map
