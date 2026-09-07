#!/usr/bin/env node

// src/save-agent-result.ts
import { readFile, writeFile } from "node:fs/promises";

// src/preview-validation.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isPreviewValidationOutcome(value) {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.status) {
    case "skipped":
      return typeof value.reason === "string";
    case "unchanged":
      return true;
    case "passed":
      return typeof value.commands === "number";
    case "failed":
      return typeof value.command === "string" && typeof value.exitCode === "number" && typeof value.output === "string";
    default:
      return false;
  }
}
function describePreviewValidation(outcome2) {
  switch (outcome2.status) {
    case "skipped":
      return `Deterministic preview validation skipped: ${outcome2.reason}.`;
    case "unchanged":
      return "Deterministic preview validation skipped: the preview directory is unchanged.";
    case "passed":
      return `Deterministic preview validation passed (${outcome2.commands} commands).`;
    case "failed":
      return `Deterministic preview validation failed: ${JSON.stringify(outcome2.command)} exited with code ${outcome2.exitCode}.`;
  }
}

// src/agent-result.ts
var DEFAULT_AGENT_RESULT = {
  summary: "Claude did not return a structured triage result.",
  probableCause: "The agent step failed or reached its hard limit.",
  confidence: "low",
  fixAttempted: false,
  fixComplete: false,
  prTitle: "",
  prBody: "",
  validation: "No validation result was returned.",
  previewAttempted: false,
  previewReady: false,
  previewValidation: "No preview validation result was returned."
};
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function isAgentResult(value) {
  if (!isRecord2(value)) {
    return false;
  }
  return typeof value.summary === "string" && typeof value.probableCause === "string" && (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high") && typeof value.fixAttempted === "boolean" && typeof value.fixComplete === "boolean" && typeof value.prTitle === "string" && typeof value.prBody === "string" && typeof value.validation === "string" && typeof value.previewAttempted === "boolean" && typeof value.previewReady === "boolean" && typeof value.previewValidation === "string";
}
function createApiFailureResult(executionMessages2) {
  if (!Array.isArray(executionMessages2)) {
    return void 0;
  }
  const terminalResult = executionMessages2.findLast(
    (message) => isRecord2(message) && message.type === "result" && message.terminal_reason === "api_error"
  );
  if (!isRecord2(terminalResult)) {
    return void 0;
  }
  const detail = typeof terminalResult.result === "string" ? terminalResult.result : "";
  if (detail.includes("Token exchange failed with status 401")) {
    const requestId = detail.match(/\breq_[A-Za-z0-9]+\b/)?.[0];
    return {
      ...DEFAULT_AGENT_RESULT,
      summary: "Claude could not start because Anthropic rejected the workload identity token.",
      probableCause: requestId ? `The configured federation rule did not authorize this workflow's GitHub OIDC token (Anthropic request ${requestId}).` : `The configured federation rule did not authorize this workflow's GitHub OIDC token.`,
      confidence: "high",
      validation: "No model request or sandbox tool call ran. Correct the Anthropic workload identity rule and retry."
    };
  }
  return {
    ...DEFAULT_AGENT_RESULT,
    summary: "Claude could not complete the triage because the Anthropic API request failed.",
    probableCause: "Claude Code reported a terminal API error before producing structured output.",
    confidence: "high",
    validation: "No validated triage result was returned; retry after checking Anthropic availability."
  };
}
function selectAgentResult(structuredResultJson, executionMessages2) {
  if (structuredResultJson) {
    try {
      const structuredResult = JSON.parse(structuredResultJson);
      if (isAgentResult(structuredResult)) {
        return structuredResult;
      }
    } catch {
    }
  }
  return createApiFailureResult(executionMessages2) ?? DEFAULT_AGENT_RESULT;
}
function applyPreviewValidation(result2, outcome2) {
  const description = outcome2 ? describePreviewValidation(outcome2) : "Deterministic preview validation did not run.";
  const validated = outcome2?.status === "passed" || outcome2?.status === "skipped";
  return {
    ...result2,
    previewReady: result2.previewReady && validated,
    previewValidation: `${result2.previewValidation}
${description}`.trim()
  };
}

// src/execution-timeline.ts
var INPUT_PREVIEW_CHARS = 100;
var MAX_ENTRIES = 400;
var DESCRIPTIVE_INPUT_KEYS = ["command", "skill", "path", "file_path", "pattern", "query", "cwd"];
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function compact(value, maximumLength) {
  const compacted = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return compacted.length <= maximumLength ? compacted : `${compacted.slice(0, maximumLength - 1)}\u2026`;
}
function describeInput(input) {
  if (!isRecord3(input)) {
    return "";
  }
  for (const key of DESCRIPTIVE_INPUT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) {
      return compact(value, INPUT_PREVIEW_CHARS);
    }
  }
  const firstString = Object.values(input).find(
    (value) => typeof value === "string" && value.trim() !== ""
  );
  return firstString === void 0 ? "" : compact(firstString, INPUT_PREVIEW_CHARS);
}
function contentLength(content) {
  if (typeof content === "string") {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  return content.reduce(
    (total, block) => total + (isRecord3(block) && typeof block.text === "string" ? block.text.length : 0),
    0
  );
}
function messageBlocks(message) {
  if (!isRecord3(message) || !isRecord3(message.message) || !Array.isArray(message.message.content)) {
    return [];
  }
  return message.message.content.filter(isRecord3);
}
function extractTimeline(executionMessages2) {
  if (!Array.isArray(executionMessages2)) {
    return [];
  }
  const entries = [];
  const entryByToolUseId = /* @__PURE__ */ new Map();
  let turn = 0;
  for (const message of executionMessages2) {
    if (!isRecord3(message)) {
      continue;
    }
    if (message.type === "assistant") {
      turn += 1;
      for (const block of messageBlocks(message)) {
        if (block.type !== "tool_use" || typeof block.name !== "string") {
          continue;
        }
        const entry = { turn, tool: block.name, input: describeInput(block.input) };
        entries.push(entry);
        if (typeof block.id === "string") {
          entryByToolUseId.set(block.id, entry);
        }
      }
      continue;
    }
    if (message.type !== "user") {
      continue;
    }
    for (const block of messageBlocks(message)) {
      if (block.type !== "tool_result" || typeof block.tool_use_id !== "string") {
        continue;
      }
      const entry = entryByToolUseId.get(block.tool_use_id);
      if (!entry) {
        continue;
      }
      entry.resultChars = contentLength(block.content);
      if (block.is_error === true) {
        entry.isError = true;
      }
    }
  }
  return entries;
}
function formatChars(chars) {
  return chars >= 1e3 ? `${(chars / 1e3).toFixed(1)}k chars` : `${chars} chars`;
}
function formatEntry(entry, toolWidth) {
  const outcome2 = entry.isError === true ? "error" : entry.resultChars === void 0 ? "no result" : formatChars(entry.resultChars);
  return `turn ${String(entry.turn).padEnd(4)} ${entry.tool.padEnd(toolWidth)} ${entry.input}  \u2192 ${outcome2}`;
}
function formatTimeline(executionMessages2) {
  const entries = extractTimeline(executionMessages2).slice(0, MAX_ENTRIES);
  if (entries.length === 0) {
    return "Claude timeline: no tool calls were recorded.";
  }
  const toolWidth = Math.max(...entries.map((entry) => entry.tool.length));
  const errors = entries.filter((entry) => entry.isError === true).length;
  const header = `Claude timeline: ${entries.length} tool calls over ${entries.at(-1)?.turn} turns, ${errors} errored.`;
  return [header, ...entries.map((entry) => formatEntry(entry, toolWidth))].join("\n");
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function formatTimelineSummary(executionMessages2) {
  return [
    "<details>",
    "<summary>Claude tool timeline</summary>",
    "",
    `<pre>${escapeHtml(formatTimeline(executionMessages2))}</pre>`,
    "",
    "</details>",
    ""
  ].join("\n");
}

// src/run-metadata.ts
function isRecord4(value) {
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
function validateModel(model) {
  const normalized = model.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error("MODEL must contain only letters, numbers, dots, underscores, and hyphens.");
  }
  return normalized;
}
function createRunMetadata(executionMessages2, configuration) {
  if (!isReasoningEffort(configuration.reasoningEffort)) {
    throw new Error(`Unsupported reasoning effort: ${configuration.reasoningEffort}`);
  }
  const terminalResult = Array.isArray(executionMessages2) ? executionMessages2.findLast((message) => isRecord4(message) && message.type === "result") : void 0;
  const result2 = isRecord4(terminalResult) ? terminalResult : {};
  const turns = optionalTurnCount(result2.num_turns);
  const durationMs = optionalNonNegativeNumber(result2.duration_ms);
  const costUsd = optionalNonNegativeNumber(result2.total_cost_usd);
  return {
    agent: "Claude Code",
    model: validateModel(configuration.model),
    reasoningEffort: configuration.reasoningEffort,
    ...turns === void 0 ? {} : { turns },
    ...durationMs === void 0 ? {} : { durationMs },
    ...costUsd === void 0 ? {} : { costUsd }
  };
}

// src/save-agent-result.ts
var resultPath = process.env.RESULT_PATH;
if (!resultPath) {
  throw new Error("RESULT_PATH is required.");
}
async function readOptionalJson(filePath) {
  if (!filePath) {
    return void 0;
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return void 0;
  }
}
var executionMessages = await readOptionalJson(process.env.EXECUTION_FILE);
var previewValidation = await readOptionalJson(process.env.PREVIEW_VALIDATION_PATH);
var outcome = isPreviewValidationOutcome(previewValidation) ? previewValidation : void 0;
var result = applyPreviewValidation(
  selectAgentResult(process.env.RESULT_JSON, executionMessages),
  outcome
);
var runMetadata = createRunMetadata(executionMessages, {
  model: process.env.MODEL || "",
  reasoningEffort: process.env.REASONING_EFFORT || ""
});
await writeFile(resultPath, JSON.stringify({ ...result, runMetadata }, null, 2));
console.log(formatTimeline(executionMessages));
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, formatTimelineSummary(executionMessages), {
    flag: "a"
  });
}
//# sourceMappingURL=save-agent-result.mjs.map
