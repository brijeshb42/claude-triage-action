#!/usr/bin/env node

// src/write-run-footer.ts
import { readFile, writeFile } from "node:fs/promises";

// src/run-metadata.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isReasoningEffort(value) {
  return value === "low" || value === "medium" || value === "high" || value === "max";
}
function optionalNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function optionalTurnCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
function isRunMetadata(value) {
  if (!isRecord(value)) {
    return false;
  }
  return value.agent === "Claude Code" && typeof value.model === "string" && /^[A-Za-z0-9._-]+$/.test(value.model) && isReasoningEffort(value.reasoningEffort) && (value.turns === void 0 || optionalTurnCount(value.turns) !== void 0) && (value.durationMs === void 0 || optionalNonNegativeNumber(value.durationMs) !== void 0) && (value.costUsd === void 0 || optionalNonNegativeNumber(value.costUsd) !== void 0);
}
function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function formatModel(model) {
  const withoutVendor = model.startsWith("claude-") ? model.slice("claude-".length) : model;
  const [family = "", ...version] = withoutVendor.split("-");
  return [titleCase(family), version.join(".")].filter(Boolean).join(" ");
}
function formatDuration(durationMs) {
  const seconds = Math.round(durationMs / 1e3);
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes}m${seconds % 60}s` : `${seconds}s`;
}
function formatRunFooter(metadata, runUrl) {
  const parsedRunUrl = new URL(runUrl);
  if (parsedRunUrl.protocol !== "https:" && parsedRunUrl.protocol !== "http:") {
    throw new Error("RUN_URL must use HTTP or HTTPS.");
  }
  const facts = [
    `${formatModel(metadata.model)} (${titleCase(metadata.reasoningEffort)})`,
    metadata.turns === void 0 ? void 0 : `${metadata.turns} turns`,
    metadata.durationMs === void 0 ? void 0 : formatDuration(metadata.durationMs),
    metadata.costUsd === void 0 ? void 0 : `$${metadata.costUsd.toFixed(2)}`,
    `[run](${parsedRunUrl.href})`
  ].filter((fact) => fact !== void 0);
  return `

---

_${[`\u{1F916} Review generated with ${metadata.agent}`, ...facts].join(" \xB7 ")}_`;
}

// src/write-run-footer.ts
function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
var metadataPath = requiredEnvironment("METADATA_PATH");
var outputPath = requiredEnvironment("OUTPUT_PATH");
var source = JSON.parse(await readFile(metadataPath, "utf8"));
var runMetadata = typeof source === "object" && source !== null && "runMetadata" in source ? source.runMetadata : void 0;
if (!isRunMetadata(runMetadata)) {
  throw new Error("The artifact does not contain valid run metadata.");
}
await writeFile(outputPath, formatRunFooter(runMetadata, requiredEnvironment("RUN_URL")));
//# sourceMappingURL=write-run-footer.mjs.map
