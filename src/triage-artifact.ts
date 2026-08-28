import { isTriageResult, type TriageResult } from './triage-result.js';
import { isRunMetadata, type RunMetadata } from './run-metadata.js';

export const TRIAGE_ARTIFACT_SCHEMA_VERSION = 1;
export const TRIAGE_ELIGIBILITY_DAYS = 14;

export interface TriageManifest {
  schemaVersion: typeof TRIAGE_ARTIFACT_SCHEMA_VERSION;
  repository: string;
  repositoryId: string;
  issueNumber: number;
  triggerCommentId: string;
  baseBranch: string;
  baseSha: string;
  workflowRef: string;
  runId: number;
  runAttempt: number;
  actionRef: string;
  model: string;
  runMetadata?: RunMetadata;
  createdAt: string;
  expiresAt: string;
}

export interface IssueContext {
  repository: string;
  repositoryId: string;
  number: number;
  title: string;
  body: string;
  labels: unknown[];
  comments: Array<{ author: string | null; body: string; createdAt: string }>;
}

export interface TriageArtifact {
  manifest: TriageManifest;
  issueContext: IssueContext;
  result: TriageResult;
}

export interface ExpectedTriageArtifact {
  repository: string;
  repositoryId: string;
  issueNumber: number;
  sourceRunId: number;
  defaultBranch: string;
  workflowPath: string;
  allowFailedResult?: boolean;
  now?: Date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isIssueContext(value: unknown): value is IssueContext {
  if (!isRecord(value) || !Array.isArray(value.labels) || !Array.isArray(value.comments)) {
    return false;
  }

  return (
    typeof value.repository === 'string' &&
    typeof value.repositoryId === 'string' &&
    typeof value.number === 'number' &&
    Number.isInteger(value.number) &&
    typeof value.title === 'string' &&
    typeof value.body === 'string' &&
    value.comments.every(
      (comment) =>
        isRecord(comment) &&
        (typeof comment.author === 'string' || comment.author === null) &&
        typeof comment.body === 'string' &&
        typeof comment.createdAt === 'string',
    )
  );
}

export function isTriageManifest(value: unknown): value is TriageManifest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.schemaVersion === TRIAGE_ARTIFACT_SCHEMA_VERSION &&
    typeof value.repository === 'string' &&
    typeof value.repositoryId === 'string' &&
    typeof value.issueNumber === 'number' &&
    Number.isInteger(value.issueNumber) &&
    typeof value.triggerCommentId === 'string' &&
    typeof value.baseBranch === 'string' &&
    typeof value.baseSha === 'string' &&
    /^[a-f0-9]{40}$/.test(value.baseSha) &&
    typeof value.workflowRef === 'string' &&
    typeof value.runId === 'number' &&
    Number.isInteger(value.runId) &&
    typeof value.runAttempt === 'number' &&
    Number.isInteger(value.runAttempt) &&
    typeof value.actionRef === 'string' &&
    typeof value.model === 'string' &&
    (value.runMetadata === undefined || isRunMetadata(value.runMetadata)) &&
    typeof value.createdAt === 'string' &&
    typeof value.expiresAt === 'string'
  );
}

export function workflowPathFromRef(workflowRef: string): string {
  const separator = workflowRef.lastIndexOf('@');
  const withoutRef = separator === -1 ? workflowRef : workflowRef.slice(0, separator);
  const workflowMarker = '/.github/workflows/';
  const markerIndex = withoutRef.lastIndexOf(workflowMarker);
  if (markerIndex === -1) {
    throw new Error(`Invalid workflow ref: ${workflowRef}`);
  }
  return withoutRef.slice(markerIndex + 1);
}

/** Validate every durable identity field before a triage artifact can drive a fix. */
export function validateTriageArtifact(
  manifestValue: unknown,
  issueContextValue: unknown,
  resultValue: unknown,
  expected: ExpectedTriageArtifact,
): TriageArtifact {
  if (!isTriageManifest(manifestValue)) {
    throw new Error('The triage manifest does not match the supported schema.');
  }
  if (!isIssueContext(issueContextValue)) {
    throw new Error('The triage issue snapshot is malformed.');
  }
  if (!isTriageResult(resultValue)) {
    throw new Error('The structured triage result is malformed.');
  }

  const manifest = manifestValue;
  const issueContext = issueContextValue;
  const result = resultValue;
  const now = expected.now ?? new Date();
  const createdAt = new Date(manifest.createdAt);
  const expiresAt = new Date(manifest.expiresAt);

  if (Number.isNaN(createdAt.valueOf()) || Number.isNaN(expiresAt.valueOf())) {
    throw new Error('The triage artifact has invalid timestamps.');
  }
  if (createdAt.valueOf() > now.valueOf() + 5 * 60_000) {
    throw new Error('The triage artifact creation time is in the future.');
  }
  if (expiresAt.valueOf() <= now.valueOf()) {
    throw new Error('The triage artifact has expired; run triage again.');
  }
  if (
    expiresAt.valueOf() - createdAt.valueOf() >
    (TRIAGE_ELIGIBILITY_DAYS * 24 * 60 * 60 + 5 * 60) * 1_000
  ) {
    throw new Error('The triage artifact exceeds the maximum eligibility window.');
  }
  if (
    manifest.repository !== expected.repository ||
    manifest.repositoryId !== expected.repositoryId
  ) {
    throw new Error('The triage artifact belongs to a different repository.');
  }
  if (
    manifest.issueNumber !== expected.issueNumber ||
    issueContext.number !== expected.issueNumber
  ) {
    throw new Error('The triage artifact belongs to a different issue.');
  }
  if (
    issueContext.repository !== expected.repository ||
    issueContext.repositoryId !== expected.repositoryId
  ) {
    throw new Error('The triage issue snapshot belongs to a different repository.');
  }
  if (manifest.runId !== expected.sourceRunId) {
    throw new Error('The triage artifact run identity does not match its source run.');
  }
  if (manifest.baseBranch !== expected.defaultBranch) {
    throw new Error('The triage artifact was not created from the current default branch.');
  }
  if (workflowPathFromRef(manifest.workflowRef) !== expected.workflowPath) {
    throw new Error('The triage artifact was created by a different workflow.');
  }
  if (result.status !== 'completed' && expected.allowFailedResult !== true) {
    throw new Error('The triage artifact records an incomplete model run.');
  }

  return { manifest, issueContext, result };
}
