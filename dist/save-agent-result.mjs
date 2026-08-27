#!/usr/bin/env node

// src/save-agent-result.ts
import { readFile, writeFile } from "node:fs/promises";

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
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isAgentResult(value) {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.summary === "string" && typeof value.probableCause === "string" && (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high") && typeof value.fixAttempted === "boolean" && typeof value.fixComplete === "boolean" && typeof value.prTitle === "string" && typeof value.prBody === "string" && typeof value.validation === "string" && typeof value.previewAttempted === "boolean" && typeof value.previewReady === "boolean" && typeof value.previewValidation === "string";
}
function createApiFailureResult(executionMessages2) {
  if (!Array.isArray(executionMessages2)) {
    return void 0;
  }
  const terminalResult = executionMessages2.findLast(
    (message) => isRecord(message) && message.type === "result" && message.terminal_reason === "api_error"
  );
  if (!isRecord(terminalResult)) {
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

// src/save-agent-result.ts
var resultPath = process.env.RESULT_PATH;
if (!resultPath) {
  throw new Error("RESULT_PATH is required.");
}
var executionMessages;
if (process.env.EXECUTION_FILE) {
  try {
    executionMessages = JSON.parse(await readFile(process.env.EXECUTION_FILE, "utf8"));
  } catch {
    executionMessages = void 0;
  }
}
var result = selectAgentResult(process.env.RESULT_JSON, executionMessages);
await writeFile(resultPath, JSON.stringify(result, null, 2));
//# sourceMappingURL=save-agent-result.mjs.map
