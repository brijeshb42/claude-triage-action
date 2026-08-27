import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateTriageArtifact, workflowPathFromRef } from '../src/triage-artifact.js';

const NOW = new Date('2026-08-27T12:00:00.000Z');

function createArtifact() {
  return {
    manifest: {
      schemaVersion: 1,
      repository: 'example/project',
      repositoryId: '1234',
      issueNumber: 42,
      triggerCommentId: '100',
      baseBranch: 'main',
      baseSha: 'a'.repeat(40),
      workflowRef: 'example/project/.github/workflows/claude-review.yml@refs/heads/main',
      runId: 500,
      runAttempt: 1,
      actionRef: 'abc123',
      model: 'claude-sonnet-4-6',
      createdAt: '2026-08-27T11:00:00.000Z',
      expiresAt: '2026-09-10T11:00:00.000Z',
    },
    issueContext: {
      repository: 'example/project',
      repositoryId: '1234',
      number: 42,
      title: 'Example issue',
      body: 'Description',
      labels: [],
      comments: [],
    },
    result: {
      status: 'completed',
      disposition: 'actionable',
      summary: 'Summary',
      probableCause: 'Cause',
      confidence: 'medium',
      relevantPaths: ['src/example.ts'],
      evidence: ['Evidence'],
      validationPlan: ['Plan'],
      unresolvedQuestions: [],
    },
  } as const;
}

const expected = {
  repository: 'example/project',
  repositoryId: '1234',
  issueNumber: 42,
  sourceRunId: 500,
  defaultBranch: 'main',
  workflowPath: '.github/workflows/claude-review.yml',
  now: NOW,
};

describe('workflowPathFromRef', () => {
  it('extracts the caller workflow path', () => {
    assert.equal(
      workflowPathFromRef('example/project/.github/workflows/claude-review.yml@refs/heads/main'),
      '.github/workflows/claude-review.yml',
    );
  });
});

describe('validateTriageArtifact', () => {
  it('accepts a complete artifact bound to the expected repository, issue, run, and workflow', () => {
    const artifact = createArtifact();

    assert.deepEqual(
      validateTriageArtifact(artifact.manifest, artifact.issueContext, artifact.result, expected),
      artifact,
    );
  });

  it('rejects an expired artifact', () => {
    const artifact = createArtifact();

    assert.throws(
      () =>
        validateTriageArtifact(artifact.manifest, artifact.issueContext, artifact.result, {
          ...expected,
          now: new Date('2026-09-11T00:00:00.000Z'),
        }),
      /expired/,
    );
  });

  it('rejects a manifest that extends its own eligibility window', () => {
    const artifact = createArtifact();

    assert.throws(
      () =>
        validateTriageArtifact(
          { ...artifact.manifest, expiresAt: '2026-10-01T00:00:00.000Z' },
          artifact.issueContext,
          artifact.result,
          expected,
        ),
      /maximum eligibility window/,
    );
  });

  it('rejects a different repository even when the artifact name was selected', () => {
    const artifact = createArtifact();

    assert.throws(
      () =>
        validateTriageArtifact(artifact.manifest, artifact.issueContext, artifact.result, {
          ...expected,
          repositoryId: '9999',
        }),
      /different repository/,
    );
  });

  it('rejects failed model output', () => {
    const artifact = createArtifact();

    assert.throws(
      () =>
        validateTriageArtifact(
          artifact.manifest,
          artifact.issueContext,
          { ...artifact.result, status: 'failed' },
          expected,
        ),
      /incomplete model run/,
    );
  });

  it('allows a trusted reporter to classify failed model output', () => {
    const artifact = createArtifact();
    const failedResult = { ...artifact.result, status: 'failed' } as const;

    assert.equal(
      validateTriageArtifact(artifact.manifest, artifact.issueContext, failedResult, {
        ...expected,
        allowFailedResult: true,
      }).result.status,
      'failed',
    );
  });
});
