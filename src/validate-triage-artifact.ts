#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { validateTriageArtifact, workflowPathFromRef } from './triage-artifact.js';

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

const artifactDirectory = path.resolve(requiredEnvironment('ARTIFACT_DIRECTORY'));
const manifestValue: unknown = JSON.parse(
  await readFile(path.join(artifactDirectory, 'triage-manifest.json'), 'utf8'),
);
const issueContextValue: unknown = JSON.parse(
  await readFile(path.join(artifactDirectory, 'issue-context.json'), 'utf8'),
);
const resultValue: unknown = JSON.parse(
  await readFile(path.join(artifactDirectory, 'triage-result.json'), 'utf8'),
);
const artifact = validateTriageArtifact(manifestValue, issueContextValue, resultValue, {
  repository: requiredEnvironment('EXPECTED_REPOSITORY'),
  repositoryId: requiredEnvironment('EXPECTED_REPOSITORY_ID'),
  issueNumber: Number(requiredEnvironment('EXPECTED_ISSUE_NUMBER')),
  sourceRunId: Number(requiredEnvironment('EXPECTED_SOURCE_RUN_ID')),
  defaultBranch: requiredEnvironment('EXPECTED_DEFAULT_BRANCH'),
  workflowPath:
    process.env.EXPECTED_WORKFLOW_PATH ||
    workflowPathFromRef(requiredEnvironment('EXPECTED_WORKFLOW_REF')),
});

if (process.env.GITHUB_OUTPUT) {
  await writeFile(
    process.env.GITHUB_OUTPUT,
    [
      `base-sha=${artifact.manifest.baseSha}`,
      `disposition=${artifact.result.disposition}`,
      `artifact-run-id=${artifact.manifest.runId}`,
      '',
    ].join('\n'),
    { flag: 'a' },
  );
}
