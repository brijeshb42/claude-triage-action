#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { selectAgentResult } from './agent-result.js';
import { createRunMetadata } from './run-metadata.js';

const resultPath = process.env.RESULT_PATH;
if (!resultPath) {
  throw new Error('RESULT_PATH is required.');
}

let executionMessages: unknown;
if (process.env.EXECUTION_FILE) {
  try {
    executionMessages = JSON.parse(await readFile(process.env.EXECUTION_FILE, 'utf8'));
  } catch {
    executionMessages = undefined;
  }
}

const result = selectAgentResult(process.env.RESULT_JSON, executionMessages);
const runMetadata = createRunMetadata(executionMessages, {
  model: process.env.MODEL || '',
  reasoningEffort: process.env.REASONING_EFFORT || '',
  reviewDepth: process.env.REVIEW_DEPTH || '',
});
await writeFile(resultPath, JSON.stringify({ ...result, runMetadata }, null, 2));
