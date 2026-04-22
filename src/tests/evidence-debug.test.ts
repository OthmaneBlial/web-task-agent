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
    runId: "job_debug",
    startedAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    status: "running",
    input: {
      instruction: "Inspect evidence debug output",
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
      jobTitle: "Evidence debug test"
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
        query: "evidence debug",
        queryStatus: "completed",
        rank: 1,
        sourceId: "src_1",
        documentId: "doc_1",
        title: "Debug guide",
        url: "https://docs.example.com/debug-guide",
        canonicalUrl: "https://docs.example.com/debug-guide",
        site: "docs.example.com",
        snippet: "",
        reviewStatus: "read",
        capturedAt: "2026-03-20T10:05:01.000Z",
        pageTitle: "Debug guide",
        description: "Guide to inspect evidence debug output.",
        headings: ["Debugging"],
        paragraphs: ["This guide explains how to inspect evidence debug output."],
        contentType: "documentation",
        qualitySignals: ["documentation domain", "multiple paragraphs"],
        sourceQualityScore: 0.82,
        freshnessScore: 0.93,
        trendScore: 0.88,
        overallScore: 0.86,
        extractions: [
          {
            id: "ext_1",
            sourceId: "src_1",
            documentId: "doc_1",
            kind: "claim",
            value: "Debug output explains source scoring.",
            evidenceText: "Debug output explains source scoring.",
            confidence: 0.79,
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

test("report includes an evidence debug section with source diagnostics", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-debug-"));

  try {
    const report = renderReport(buildState(tempDir), buildEvidenceBundle());
    assert.match(report, /## Evidence Debug/);
    assert.match(report, /Signals:/);
    assert.match(report, /quality .*%/i);
    assert.match(report, /Debug output explains source scoring/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
