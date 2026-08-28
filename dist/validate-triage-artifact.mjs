#!/usr/bin/env node

// src/validate-triage-artifact.ts
import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";

// src/triage-result.ts
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isTriageResult(value) {
  if (!isRecord(value)) {
    return false;
  }
  return (value.status === "completed" || value.status === "failed") && (value.disposition === "actionable" || value.disposition === "needs_information" || value.disposition === "no_safe_fix" || value.disposition === "out_of_scope") && typeof value.summary === "string" && typeof value.probableCause === "string" && (value.confidence === "low" || value.confidence === "medium" || value.confidence === "high") && isStringArray(value.relevantPaths) && isStringArray(value.evidence) && isStringArray(value.validationPlan) && isStringArray(value.unresolvedQuestions);
}

// src/run-metadata.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null;
}
function isReasoningEffort(value) {
  return value === "low" || value === "medium" || value === "high" || value === "max";
}
function isReviewDepth(value) {
  return value === "low" || value === "medium" || value === "high" || value === "xhigh" || value === "max";
}
function optionalNonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function optionalTurnCount(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : void 0;
}
function isRunMetadata(value) {
  if (!isRecord2(value)) {
    return false;
  }
  return value.agent === "Claude Code" && typeof value.model === "string" && /^[A-Za-z0-9._-]+$/.test(value.model) && isReasoningEffort(value.reasoningEffort) && isReviewDepth(value.reviewDepth) && (value.turns === void 0 || optionalTurnCount(value.turns) !== void 0) && (value.durationMs === void 0 || optionalNonNegativeNumber(value.durationMs) !== void 0) && (value.costUsd === void 0 || optionalNonNegativeNumber(value.costUsd) !== void 0);
}

// src/triage-artifact.ts
var TRIAGE_ARTIFACT_SCHEMA_VERSION = 1;
var TRIAGE_ELIGIBILITY_DAYS = 14;
function isRecord3(value) {
  return typeof value === "object" && value !== null;
}
function isIssueContext(value) {
  if (!isRecord3(value) || !Array.isArray(value.labels) || !Array.isArray(value.comments)) {
    return false;
  }
  return typeof value.repository === "string" && typeof value.repositoryId === "string" && typeof value.number === "number" && Number.isInteger(value.number) && typeof value.title === "string" && typeof value.body === "string" && value.comments.every(
    (comment) => isRecord3(comment) && (typeof comment.author === "string" || comment.author === null) && typeof comment.body === "string" && typeof comment.createdAt === "string"
  );
}
function isTriageManifest(value) {
  if (!isRecord3(value)) {
    return false;
  }
  return value.schemaVersion === TRIAGE_ARTIFACT_SCHEMA_VERSION && typeof value.repository === "string" && typeof value.repositoryId === "string" && typeof value.issueNumber === "number" && Number.isInteger(value.issueNumber) && typeof value.triggerCommentId === "string" && typeof value.baseBranch === "string" && typeof value.baseSha === "string" && /^[a-f0-9]{40}$/.test(value.baseSha) && typeof value.workflowRef === "string" && typeof value.runId === "number" && Number.isInteger(value.runId) && typeof value.runAttempt === "number" && Number.isInteger(value.runAttempt) && typeof value.actionRef === "string" && typeof value.model === "string" && (value.runMetadata === void 0 || isRunMetadata(value.runMetadata)) && typeof value.createdAt === "string" && typeof value.expiresAt === "string";
}
function workflowPathFromRef(workflowRef) {
  const separator = workflowRef.lastIndexOf("@");
  const withoutRef = separator === -1 ? workflowRef : workflowRef.slice(0, separator);
  const workflowMarker = "/.github/workflows/";
  const markerIndex = withoutRef.lastIndexOf(workflowMarker);
  if (markerIndex === -1) {
    throw new Error(`Invalid workflow ref: ${workflowRef}`);
  }
  return withoutRef.slice(markerIndex + 1);
}
function validateTriageArtifact(manifestValue2, issueContextValue2, resultValue2, expected) {
  if (!isTriageManifest(manifestValue2)) {
    throw new Error("The triage manifest does not match the supported schema.");
  }
  if (!isIssueContext(issueContextValue2)) {
    throw new Error("The triage issue snapshot is malformed.");
  }
  if (!isTriageResult(resultValue2)) {
    throw new Error("The structured triage result is malformed.");
  }
  const manifest = manifestValue2;
  const issueContext = issueContextValue2;
  const result = resultValue2;
  const now = expected.now ?? /* @__PURE__ */ new Date();
  const createdAt = new Date(manifest.createdAt);
  const expiresAt = new Date(manifest.expiresAt);
  if (Number.isNaN(createdAt.valueOf()) || Number.isNaN(expiresAt.valueOf())) {
    throw new Error("The triage artifact has invalid timestamps.");
  }
  if (createdAt.valueOf() > now.valueOf() + 5 * 6e4) {
    throw new Error("The triage artifact creation time is in the future.");
  }
  if (expiresAt.valueOf() <= now.valueOf()) {
    throw new Error("The triage artifact has expired; run triage again.");
  }
  if (expiresAt.valueOf() - createdAt.valueOf() > (TRIAGE_ELIGIBILITY_DAYS * 24 * 60 * 60 + 5 * 60) * 1e3) {
    throw new Error("The triage artifact exceeds the maximum eligibility window.");
  }
  if (manifest.repository !== expected.repository || manifest.repositoryId !== expected.repositoryId) {
    throw new Error("The triage artifact belongs to a different repository.");
  }
  if (manifest.issueNumber !== expected.issueNumber || issueContext.number !== expected.issueNumber) {
    throw new Error("The triage artifact belongs to a different issue.");
  }
  if (issueContext.repository !== expected.repository || issueContext.repositoryId !== expected.repositoryId) {
    throw new Error("The triage issue snapshot belongs to a different repository.");
  }
  if (manifest.runId !== expected.sourceRunId) {
    throw new Error("The triage artifact run identity does not match its source run.");
  }
  if (manifest.baseBranch !== expected.defaultBranch) {
    throw new Error("The triage artifact was not created from the current default branch.");
  }
  if (workflowPathFromRef(manifest.workflowRef) !== expected.workflowPath) {
    throw new Error("The triage artifact was created by a different workflow.");
  }
  if (result.status !== "completed" && expected.allowFailedResult !== true) {
    throw new Error("The triage artifact records an incomplete model run.");
  }
  return { manifest, issueContext, result };
}

// src/validate-triage-artifact.ts
function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
var artifactDirectory = path.resolve(requiredEnvironment("ARTIFACT_DIRECTORY"));
var manifestValue = JSON.parse(
  await readFile(path.join(artifactDirectory, "triage-manifest.json"), "utf8")
);
var issueContextValue = JSON.parse(
  await readFile(path.join(artifactDirectory, "issue-context.json"), "utf8")
);
var resultValue = JSON.parse(
  await readFile(path.join(artifactDirectory, "triage-result.json"), "utf8")
);
var artifact = validateTriageArtifact(manifestValue, issueContextValue, resultValue, {
  repository: requiredEnvironment("EXPECTED_REPOSITORY"),
  repositoryId: requiredEnvironment("EXPECTED_REPOSITORY_ID"),
  issueNumber: Number(requiredEnvironment("EXPECTED_ISSUE_NUMBER")),
  sourceRunId: Number(requiredEnvironment("EXPECTED_SOURCE_RUN_ID")),
  defaultBranch: requiredEnvironment("EXPECTED_DEFAULT_BRANCH"),
  workflowPath: process.env.EXPECTED_WORKFLOW_PATH || workflowPathFromRef(requiredEnvironment("EXPECTED_WORKFLOW_REF")),
  allowFailedResult: process.env.ALLOW_FAILED_RESULT === "true"
});
if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    [
      `base-sha=${artifact.manifest.baseSha}`,
      `disposition=${artifact.result.disposition}`,
      `artifact-run-id=${artifact.manifest.runId}`,
      ""
    ].join("\n"),
    { flag: "a" }
  );
}
//# sourceMappingURL=validate-triage-artifact.mjs.map
