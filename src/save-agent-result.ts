#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { applyPreviewValidation, selectAgentResult } from './agent-result.js';
import { formatTimeline, formatTimelineSummary } from './execution-timeline.js';
import { isPreviewValidationOutcome, type PreviewValidationOutcome } from './preview-validation.js';
import { createRunMetadata } from './run-metadata.js';

const resultPath = process.env.RESULT_PATH;
if (!resultPath) {
  throw new Error('RESULT_PATH is required.');
}

async function readOptionalJson(filePath: string | undefined): Promise<unknown> {
  if (!filePath) {
    return undefined;
  }
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return undefined;
  }
}

const executionMessages = await readOptionalJson(process.env.EXECUTION_FILE);
const previewValidation = await readOptionalJson(process.env.PREVIEW_VALIDATION_PATH);
const outcome: PreviewValidationOutcome | undefined = isPreviewValidationOutcome(previewValidation)
  ? previewValidation
  : undefined;

const result = applyPreviewValidation(
  selectAgentResult(process.env.RESULT_JSON, executionMessages),
  outcome,
);
const runMetadata = createRunMetadata(executionMessages, {
  model: process.env.MODEL || '',
  reasoningEffort: process.env.REASONING_EFFORT || '',
});
await writeFile(resultPath, JSON.stringify({ ...result, runMetadata }, null, 2));

console.log(formatTimeline(executionMessages));
if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, formatTimelineSummary(executionMessages), {
    flag: 'a',
  });
}
