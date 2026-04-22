import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { renderReport } from "../tasks/agent/synthesis-stage";
import type { AgentEvidenceBundle, AgentRunState } from "../types";

function buildState(tempDir: string): AgentRunState {
  return {
    task: "agent",
    runId: "job_outline",
    startedAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    status: "running",
    input: {
      instruction: "Check report outline",
      memoryPath: null,
      maxQueries: 4,
      maxResultsPerQuery: 10,
      fetchBatchSize: 4,
      researchDurationMinutes: null,
      maxRuntimeHours: 4,
      workflowName: null,
      workflowPresetId: null,
      workflowTemplateId: null,
      workflowInputs: {},
      jobTitle: "Report outline test"
    },
    runtime: {
      leaseOwnerId: null,
      leaseTtlSeconds: 900,
      heartbeatIntervalSeconds: 60,
      heartbeatAt: null,
      recoveredAt: null,
      recoveryCount: 0,
      researchStartedAt: null,
      researchElapsedSeconds: 0,
      executionDeadlineAt: null
    },
    reportPath: path.join(tempDir, "report.md"),
    artifactDir: tempDir,
    plan: null,
    pipeline: {
      version: 2,
      workItems: []
    },
    research: [],
    researchSummary: null,
    outputs: {
      planPath: null,
      pipelineManifestPath: null,
      researchSummaryPath: null,
      postDraftPath: null,
      commentsDraftPath: null,
      workflowBriefPath: null,
      packageManifestPath: null,
      packageReadmePath: null,
      promptTracePath: null
    },
    notes: []
  };
}

function buildEvidenceBundle(): AgentEvidenceBundle {
  return {
    counts: {
      queries: 1,
      sources: 1,
      documents: 1,
      extractions: 1,
      clusters: 0,
      contradictions: 0
    },
    queries: [],
    sources: [
      {
        query: "outline",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Outline source",
        url: "https://docs.example.com/outline",
        canonicalUrl: "https://docs.example.com/outline",
        site: "docs.example.com",
        snippet: "",
        reviewStatus: "read",
        capturedAt: "2026-03-20T10:05:01.000Z",
        pageTitle: "Outline source",
        description: "Source for the report outline test.",
        headings: [],
        paragraphs: [],
        contentType: "documentation",
        qualitySignals: [],
        sourceQualityScore: 0.8,
        freshnessScore: 0.9,
        trendScore: 0.8,
        overallScore: 0.84,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "claim",
            value: "Outline source claim.",
            evidenceText: "Outline source claim.",
            confidence: 0.8,
            method: "fixture"
          }
        ]
      }
    ],
    highlights: {
      entities: [],
      themes: [],
      complaints: [],
      featureRequests: [],
      claims: []
    },
    clusters: [],
    contradictions: []
  };
}

test("report outline reflects available sections and omits empty ones", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-outline-"));

  try {
    const report = renderReport(buildState(tempDir), buildEvidenceBundle());
    assert.match(report, /## Report Outline/);
    assert.match(report, /- Evidence Snapshot/);
    assert.match(report, /- Evidence Debug/);
    assert.match(report, /- Evidence-Backed Signals/);
    assert.doesNotMatch(report, /- Repeated Evidence Clusters/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
