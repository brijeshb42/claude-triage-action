#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { TRIAGE_ARTIFACT_SCHEMA_VERSION, TRIAGE_ELIGIBILITY_DAYS } from './triage-artifact.js';
import { createRunMetadata } from './run-metadata.js';
import {
  formatTriageLogLine,
  formatTriageStepSummary,
  selectTriageResult,
} from './triage-result.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function positiveInteger(name: string): number {
  const value = Number(requiredEnvironment(name));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

let executionMessages: unknown;
if (process.env.EXECUTION_FILE) {
  try {
    executionMessages = JSON.parse(await readFile(process.env.EXECUTION_FILE, 'utf8'));
  } catch {
    executionMessages = undefined;
  }
}

const result = selectTriageResult(process.env.RESULT_JSON, executionMessages);
const runMetadata = createRunMetadata(executionMessages, {
  model: requiredEnvironment('MODEL'),
  reasoningEffort: requiredEnvironment('REASONING_EFFORT'),
  reviewDepth: requiredEnvironment('REVIEW_DEPTH'),
});
const outputDirectory = path.resolve(requiredEnvironment('OUTPUT_DIRECTORY'));
const createdAt = new Date();
const expiresAt = new Date(createdAt.valueOf() + TRIAGE_ELIGIBILITY_DAYS * 24 * 60 * 60 * 1_000);
const manifest = {
  schemaVersion: TRIAGE_ARTIFACT_SCHEMA_VERSION,
  repository: requiredEnvironment('REPOSITORY'),
  repositoryId: requiredEnvironment('REPOSITORY_ID'),
  issueNumber: positiveInteger('ISSUE_NUMBER'),
  triggerCommentId: requiredEnvironment('TRIGGER_COMMENT_ID'),
  baseBranch: requiredEnvironment('BASE_BRANCH'),
  baseSha: requiredEnvironment('BASE_SHA'),
  workflowRef: requiredEnvironment('WORKFLOW_REF'),
  runId: positiveInteger('RUN_ID'),
  runAttempt: positiveInteger('RUN_ATTEMPT'),
  actionRef: process.env.ACTION_REF || 'local',
  model: requiredEnvironment('MODEL'),
  runMetadata,
  createdAt: createdAt.toISOString(),
  expiresAt: expiresAt.toISOString(),
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, 'triage-manifest.json'),
  JSON.stringify(manifest, null, 2),
);
await writeFile(path.join(outputDirectory, 'triage-result.json'), JSON.stringify(result, null, 2));

console.log(formatTriageLogLine(result));
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, formatTriageStepSummary(result), { flag: 'a' });
}

if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    [
      `disposition=${result.disposition}`,
      `should-fix=${result.status === 'completed' && result.disposition === 'actionable'}`,
      `expires-at=${manifest.expiresAt}`,
      '',
    ].join('\n'),
    { flag: 'a' },
  );
}
