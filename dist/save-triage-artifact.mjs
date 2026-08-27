#!/usr/bin/env node

// src/save-triage-artifact.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

// src/triage-result.ts
var DEFAULT_TRIAGE_RESULT = {
  status: "failed",
  disposition: "no_safe_fix",
  summary: "Claude did not return a structured triage result.",
  probableCause: "The triage step failed or reached its hard limit.",
  confidence: "low",
  relevantPaths: [],
  evidence: [],
  validationPlan: [],
  unresolvedQuestions: ["Retry the read-only triage."]
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function compactText(value, maximumLength) {
  const compacted = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return compacted.length <= maximumLength ? compacted : `${compacted.slice(0, maximumLength - 1)}\u2026`;
}
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function formatHtmlList(values, ordered) {
  if (values.length === 0) {
    return "<p>None.</p>";
  }
  const tag = ordered ? "ol" : "ul";
  const items = values.slice(0, 20).map((value) => `<li><code>${escapeHtml(compactText(value, 2e3))}</code></li>`).join("\n");
  return `<${tag}>
${items}
</${tag}>`;
}
function formatTriageLogLine(result2) {
  return `Triage result: ${result2.disposition}; ${result2.confidence} confidence; ` + compactText(result2.summary, 1e3);
}
function formatTriageStepSummary(result2) {
  return [
    "## Claude read-only triage",
    "",
    `**Status:** \`${result2.status}\` \xB7 **Disposition:** \`${result2.disposition}\` \xB7 **Confidence:** \`${result2.confidence}\``,
    "",
    "### Summary",
    "",
    `<pre>${escapeHtml(compactText(result2.summary, 4e3))}</pre>`,
    "",
    "### Probable cause",
    "",
    `<pre>${escapeHtml(compactText(result2.probableCause, 4e3))}</pre>`,
    "",
    "### Relevant paths",
    "",
    formatHtmlList(result2.relevantPaths, false),
    "",
    "### Validation plan",
    "",
    formatHtmlList(result2.validationPlan, true),
    ""
  ].join("\n");
}
function isTriageResult(value) {
  if (!isRecord(value)) {
    return false;
  }
  return (value.status === "completed" || value.status === "failed") && (value.disposition === "actionable" || value.disposition === "needs_information" || value.disposition === "no_safe_fix" || value.disposition === "out_of_scope") && typeof value.summary === "string" && typeof value.probableCause === "string" && (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high") && isStringArray(value.relevantPaths) && isStringArray(value.evidence) && isStringArray(value.validationPlan) && isStringArray(value.unresolvedQuestions);
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
      ...DEFAULT_TRIAGE_RESULT,
      summary: "Claude could not start because Anthropic rejected the workload identity token.",
      probableCause: requestId ? `The federation rule rejected this workflow token (Anthropic request ${requestId}).` : "The federation rule rejected this workflow token.",
      confidence: "high",
      unresolvedQuestions: ["Correct the Anthropic workload identity rule and retry."]
    };
  }
  return {
    ...DEFAULT_TRIAGE_RESULT,
    summary: "Claude could not complete the read-only triage because the API request failed.",
    probableCause: "Claude Code reported a terminal API error before producing structured output.",
    confidence: "high",
    unresolvedQuestions: ["Retry after checking Anthropic availability."]
  };
}
function selectTriageResult(structuredResultJson, executionMessages2) {
  if (structuredResultJson) {
    try {
      const structuredResult = JSON.parse(structuredResultJson);
      if (isTriageResult(structuredResult)) {
        return structuredResult;
      }
    } catch {
    }
  }
  return createApiFailureResult(executionMessages2) ?? DEFAULT_TRIAGE_RESULT;
}

// src/triage-artifact.ts
var TRIAGE_ARTIFACT_SCHEMA_VERSION = 1;
var TRIAGE_ELIGIBILITY_DAYS = 14;

// src/save-triage-artifact.ts
function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
function positiveInteger(name) {
  const value = Number(requiredEnvironment(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}
var executionMessages;
if (process.env.EXECUTION_FILE) {
  try {
    executionMessages = JSON.parse(await readFile(process.env.EXECUTION_FILE, "utf8"));
  } catch {
    executionMessages = void 0;
  }
}
var result = selectTriageResult(process.env.RESULT_JSON, executionMessages);
var outputDirectory = path.resolve(requiredEnvironment("OUTPUT_DIRECTORY"));
var createdAt = /* @__PURE__ */ new Date();
var expiresAt = new Date(createdAt.valueOf() + TRIAGE_ELIGIBILITY_DAYS * 24 * 60 * 60 * 1e3);
var manifest = {
  schemaVersion: TRIAGE_ARTIFACT_SCHEMA_VERSION,
  repository: requiredEnvironment("REPOSITORY"),
  repositoryId: requiredEnvironment("REPOSITORY_ID"),
  issueNumber: positiveInteger("ISSUE_NUMBER"),
  triggerCommentId: requiredEnvironment("TRIGGER_COMMENT_ID"),
  baseBranch: requiredEnvironment("BASE_BRANCH"),
  baseSha: requiredEnvironment("BASE_SHA"),
  workflowRef: requiredEnvironment("WORKFLOW_REF"),
  runId: positiveInteger("RUN_ID"),
  runAttempt: positiveInteger("RUN_ATTEMPT"),
  actionRef: process.env.ACTION_REF || "local",
  model: requiredEnvironment("MODEL"),
  createdAt: createdAt.toISOString(),
  expiresAt: expiresAt.toISOString()
};
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "triage-manifest.json"),
  JSON.stringify(manifest, null, 2)
);
await writeFile(path.join(outputDirectory, "triage-result.json"), JSON.stringify(result, null, 2));
console.log(formatTriageLogLine(result));
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, formatTriageStepSummary(result), { flag: "a" });
}
if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    [
      `disposition=${result.disposition}`,
      `should-fix=${result.status === "completed" && result.disposition === "actionable"}`,
      `expires-at=${manifest.expiresAt}`,
      ""
    ].join("\n"),
    { flag: "a" }
  );
}
//# sourceMappingURL=save-triage-artifact.mjs.map
