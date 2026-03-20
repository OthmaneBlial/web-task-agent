import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildWorkflowRunOptions,
  getWorkflowTemplate
} from "../workflows";
import {
  buildAgentOutputPaths,
  writeWorkflowPackageArtifacts
} from "../workflows/output-package";
import type {
  AgentEvidenceBundle,
  AgentRunState
} from "../types";

function fixturePath(...segments: string[]): string {
  return path.join(process.cwd(), "src", "tests", "fixtures", ...segments);
}

function createSampleEvidence(): AgentEvidenceBundle {
  return {
    counts: {
      queries: 1,
      sources: 2,
      documents: 2,
      extractions: 3,
      clusters: 2,
      contradictions: 1
    },
    queries: [
      {
        query: "ai summary automation demand",
        searchedAt: "2026-03-20T12:00:00.000Z",
        status: "completed",
        resultCount: 2,
        searchProvider: "test"
      }
    ],
    sources: [],
    highlights: {
      entities: ["AI Summary Automation"],
      themes: ["Long-running research workflows"],
      complaints: ["Manual synthesis is too slow"],
      featureRequests: ["Need evidence-backed AI summaries"],
      claims: ["Teams want cleaner handoff packages"]
    },
    clusters: [
      {
        id: "cluster_feature_request_001",
        kind: "feature_request",
        label: "Need AI summary automation for long research workflows",
        sourceCount: 2,
        evidenceCount: 2,
        averageConfidence: 0.84,
        qualityScore: 0.82,
        freshnessScore: 0.95,
        trendScore: 0.93,
        overallScore: 0.9,
        sourceIds: ["src_1", "src_2"],
        evidenceIds: ["ext_1", "ext_2"],
        queries: ["ai summary automation demand"],
        supportingValues: [
          "Need AI summary automation for long research workflows",
          "Teams want evidence-backed AI summaries"
        ]
      },
      {
        id: "cluster_complaint_001",
        kind: "complaint",
        label: "Manual synthesis is too slow",
        sourceCount: 2,
        evidenceCount: 2,
        averageConfidence: 0.81,
        qualityScore: 0.8,
        freshnessScore: 0.92,
        trendScore: 0.89,
        overallScore: 0.87,
        sourceIds: ["src_1", "src_2"],
        evidenceIds: ["ext_3", "ext_4"],
        queries: ["ai summary automation demand"],
        supportingValues: ["Manual synthesis is too slow"]
      }
    ],
    contradictions: [
      {
        id: "contr_001",
        topic: "ai summary quality",
        leftClusterId: "cluster_claim_001",
        rightClusterId: "cluster_complaint_001",
        leftKind: "claim",
        rightKind: "complaint",
        leftLabel: "AI summaries work well for short runs",
        rightLabel: "Manual synthesis is too slow",
        leftScore: 0.71,
        rightScore: 0.87,
        contradictionScore: 0.66,
        reason: "Short-run quality differs from long-run operator feedback",
        sourceIds: ["src_1", "src_2"],
        evidenceIds: ["ext_1", "ext_3"],
        queries: ["ai summary automation demand"]
      }
    ]
  };
}

function createWorkflowState(
  tempDir: string,
  templateId: "android-opportunity" | "article-research"
): AgentRunState {
  const outputPaths = buildAgentOutputPaths(tempDir);
  return {
    task: "agent",
    runId: "workflow_state_001",
    startedAt: "2026-03-20T12:00:00.000Z",
    updatedAt: "2026-03-20T12:00:00.000Z",
    status: "waiting_review",
    input: {
      instruction: "Research a workflow topic",
      memoryPath: null,
      maxQueries: 6,
      maxResultsPerQuery: 20,
      fetchBatchSize: 5,
      maxRuntimeHours: 6,
      workflowName: templateId,
      workflowPresetId: "standard",
      workflowTemplateId: templateId,
      workflowInputs: {
        topic: "AI summary automation",
        audience: "product operators",
        context: null,
        preset: "standard"
      },
      jobTitle: "Workflow package test"
    },
    runtime: {
      leaseOwnerId: null,
      leaseTtlSeconds: 900,
      heartbeatIntervalSeconds: 60,
      heartbeatAt: null,
      recoveredAt: null,
      recoveryCount: 0,
      executionDeadlineAt: "2026-03-20T18:00:00.000Z"
    },
    reportPath: path.join(tempDir, "report.md"),
    artifactDir: tempDir,
    plan: null,
    pipeline: {
      version: 2,
      workItems: []
    },
    research: [],
    researchSummary: {
      executiveSummary: "Research shows repeated demand for AI summary automation in long-running workflows.",
      keyFindings: ["Manual synthesis is too slow"],
      contentAngles: ["Build an evidence-backed research copilot"],
      keyFindingDetails: [
        {
          text: "Operators repeatedly say manual synthesis is too slow for long-running research jobs.",
          evidenceIds: ["ext_3"]
        }
      ],
      contentAngleDetails: [
        {
          text: "Build an evidence-backed research copilot for long-running workflows.",
          evidenceIds: ["ext_1"]
        }
      ],
      referencedEvidence: []
    },
    outputs: {
      planPath: outputPaths.planPath,
      pipelineManifestPath: outputPaths.pipelineManifestPath,
      promptTracePath: outputPaths.promptTracePath,
      researchSummaryPath: outputPaths.researchSummaryPath,
      postDraftPath: outputPaths.postDraftPath,
      commentsDraftPath: outputPaths.commentsDraftPath,
      workflowBriefPath: outputPaths.workflowBriefPath,
      packageManifestPath: outputPaths.packageManifestPath,
      packageReadmePath: outputPaths.packageReadmePath
    },
    notes: []
  };
}

test("workflow run options use preset budgets and topic-based output paths", () => {
  const template = getWorkflowTemplate("android-opportunity");
  assert.ok(template);

  const options = buildWorkflowRunOptions({
    templateId: "android-opportunity",
    topic: "AI Study Planner",
    presetId: "deep"
  });

  assert.equal(options.workflowPresetId, "deep");
  assert.ok(options.cachePath?.endsWith(path.join(".cache", "workflows", "android-opportunity", "ai-study-planner.json")));
  assert.ok(options.reportPath?.endsWith(path.join("reports", "workflows", "android-opportunity", "ai-study-planner", "report.md")));
  assert.equal(options.maxQueries, 12);
  assert.equal(options.maxResultsPerQuery, 45);
});

test("workflow package writer creates polished handoff files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-workflow-package-"));

  try {
    const state = createWorkflowState(tempDir, "article-research");
    fs.writeFileSync(state.reportPath, "# Final Report\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.promptTracePath!), { recursive: true });
    fs.writeFileSync(state.outputs.promptTracePath!, '{\n  "version": 1,\n  "updatedAt": "2026-03-20T12:00:00.000Z",\n  "traces": []\n}\n', "utf8");

    const written = writeWorkflowPackageArtifacts(state, createSampleEvidence());
    assert.ok(written.workflowBriefPath);
    assert.ok(written.packageManifestPath);
    assert.ok(written.packageReadmePath);

    assert.ok(fs.existsSync(String(written.workflowBriefPath)));
    assert.ok(fs.existsSync(String(written.packageManifestPath)));
    assert.ok(fs.existsSync(String(written.packageReadmePath)));

    const workflowBrief = fs.readFileSync(String(written.workflowBriefPath), "utf8");
    const packageReadme = fs.readFileSync(String(written.packageReadmePath), "utf8");
    const packageManifest = fs.readFileSync(String(written.packageManifestPath), "utf8");

    assert.equal(
      workflowBrief,
      fs.readFileSync(
        fixturePath("workflow-output", "article-research", "workflow-brief.md"),
        "utf8"
      )
    );
    assert.equal(
      packageReadme,
      fs.readFileSync(
        fixturePath("workflow-output", "article-research", "README.md"),
        "utf8"
      )
    );
    assert.deepEqual(
      JSON.parse(packageManifest),
      JSON.parse(
        fs.readFileSync(
          fixturePath("workflow-output", "article-research", "package-manifest.json"),
          "utf8"
        )
      )
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
