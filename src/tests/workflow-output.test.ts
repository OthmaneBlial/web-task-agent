import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildWorkflowResearchQueries,
  buildWorkflowRunOptions,
  getWorkflowTemplate
} from "../workflows";
import {
  buildAgentOutputPaths,
  writeWorkflowPackageArtifacts
} from "../workflows/output-package";
import { renderReport, renderResearchSummary } from "../tasks/agent/synthesis-stage";
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
        leftEvidenceValues: ["AI summaries work well for short runs"],
        rightEvidenceValues: ["Manual synthesis is too slow"],
        queries: ["ai summary automation demand"]
      }
    ]
  };
}

function createWorkflowState(
  tempDir: string,
  templateId: "android-opportunity" | "article-research" | "market-opportunity"
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
      researchDurationMinutes: null,
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
      researchStartedAt: null,
      researchElapsedSeconds: 0,
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
    presetId: "deep",
    overrides: {
      researchDurationMinutes: 90
    }
  });

  assert.equal(options.workflowPresetId, "deep");
  assert.ok(options.cachePath?.endsWith(path.join(".cache", "workflows", "android-opportunity", "ai-study-planner.json")));
  assert.ok(options.reportPath?.endsWith(path.join("reports", "workflows", "android-opportunity", "ai-study-planner", "report.md")));
  assert.equal(options.maxQueries, 12);
  assert.equal(options.maxResultsPerQuery, 45);
  assert.equal(options.researchDurationMinutes, 90);
});

test("focused workflow preset splits the difference between fast and standard runs", () => {
  const options = buildWorkflowRunOptions({
    templateId: "article-research",
    topic: "AI summary automation",
    presetId: "focused"
  });

  assert.equal(options.workflowPresetId, "focused");
  assert.equal(options.maxQueries, 5);
  assert.equal(options.maxResultsPerQuery, 20);
  assert.equal(options.fetchBatchSize, 5);
  assert.equal(options.maxRuntimeHours, 5);
});

test("android opportunity workflow uses focused research queries", () => {
  const studyPlannerQueries = buildWorkflowResearchQueries({
    templateId: "android-opportunity",
    topic: "ai study planner",
    maxQueries: 5
  });
  const pdfEditorQueries = buildWorkflowResearchQueries({
    templateId: "android-opportunity",
    topic: "pdf editor",
    maxQueries: 5
  });

  assert.equal(studyPlannerQueries.length, 5);
  assert.ok(studyPlannerQueries.some((query) => query.includes("site:play.google.com")));
  assert.ok(studyPlannerQueries.every((query) => query.includes("study planner")));
  assert.ok(studyPlannerQueries.every((query) => !/competitor analysis tools/i.test(query)));

  assert.equal(pdfEditorQueries.length, 5);
  assert.ok(pdfEditorQueries.some((query) => query.includes("site:play.google.com")));
  assert.ok(pdfEditorQueries.every((query) => query.includes("pdf editor")));
  assert.ok(pdfEditorQueries.every((query) => !query.includes("study planner")));
});

test("workflow package writer creates polished handoff files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-workflow-package-"));

  try {
    const state = createWorkflowState(tempDir, "article-research");
    fs.writeFileSync(state.reportPath, "# Final Report\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.researchSummaryPath!), { recursive: true });
    fs.writeFileSync(state.outputs.researchSummaryPath!, "# Research Summary\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.planPath!), { recursive: true });
    fs.writeFileSync(state.outputs.planPath!, '{"version":1}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.postDraftPath!), { recursive: true });
    fs.writeFileSync(state.outputs.postDraftPath!, "# Draft\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.commentsDraftPath!), { recursive: true });
    fs.writeFileSync(state.outputs.commentsDraftPath!, "[]\n", "utf8");
    fs.mkdirSync(path.join(tempDir, "raw", "research"), { recursive: true });
    fs.mkdirSync(path.dirname(state.outputs.pipelineManifestPath!), { recursive: true });
    fs.writeFileSync(state.outputs.pipelineManifestPath!, '{"version":2}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.packageManifestPath!), { recursive: true });
    fs.writeFileSync(state.outputs.packageManifestPath!, '{"placeholder":true}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.packageReadmePath!), { recursive: true });
    fs.writeFileSync(state.outputs.packageReadmePath!, "# Placeholder\n", "utf8");
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
    assert.equal(JSON.parse(packageManifest).layoutChecks.allPresent, true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("workflow package writer skips packaging when no template is configured", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-workflow-package-skip-"));

  try {
    const state = createWorkflowState(tempDir, "article-research");
    state.input.workflowTemplateId = null;
    const written = writeWorkflowPackageArtifacts(state, createSampleEvidence());

    assert.equal(written.workflowBriefPath, null);
    assert.equal(written.packageManifestPath, null);
    assert.equal(written.packageReadmePath, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("report renders a dedicated ASO audit section for direct app runs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-aso-report-"));

  try {
    const state = createWorkflowState(tempDir, "android-opportunity");
    state.input.instruction =
      "Why this app is getting practically 0 downloads? Rewrite its ASO: https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app";
    state.reportPath = path.join(tempDir, "report.md");
    state.research = [
      {
        query: "Provided source: https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app",
        searchedAt: "2026-03-21T13:00:00.000Z",
        results: [
          {
            title: "Resume Builder Offline",
            url: "https://www.appbrain.com/app/nanocv-offline-resume-builder/com.nanocv.app",
            snippet: "Create professional resumes offline. 100% private, no signup.",
            site: "appbrain.com",
            reviewStatus: "read",
            dwellSeconds: 2,
            qualityScore: 0.9,
            contentType: "review",
            page: {
              title: "Resume Builder Offline - Apps on Google Play",
              url: "https://play.google.com/store/apps/details?id=com.nanocv.app&hl=en&gl=us",
              description: "Create professional resumes offline. 100% private, no signup.",
              h1: "Resume Builder Offline",
              headings: ["About this app", "BUSINESS", "Stack Attack", "Current ASO audit"],
              paragraphs: [
                "Create professional resumes offline. 100% private, no signup.",
                "Build a job-winning resume in minutes with NanoCV, the secure offline resume builder."
              ],
              capturedAt: "2026-03-21T13:00:00.000Z"
            }
          }
        ]
      },
      {
        query: "Play Store benchmark: resume builder",
        searchedAt: "2026-03-21T13:01:00.000Z",
        results: [
          {
            title: 'Play Store benchmark for "resume builder"',
            url: "https://play.google.com/store/search?q=resume%20builder&c=apps&hl=en&gl=us",
            snippet: 'Resume Builder Offline (com.nanocv.app) appears at Play Store search rank #17 for "resume builder".',
            site: "play.google.com",
            reviewStatus: "read",
            dwellSeconds: 2,
            qualityScore: 0.9,
            contentType: "review",
            page: {
              title: 'Play Store benchmark for "resume builder"',
              url: "https://play.google.com/store/search?q=resume%20builder&c=apps&hl=en&gl=us",
              description: 'Resume Builder Offline (com.nanocv.app) appears at Play Store search rank #17 for "resume builder".',
              h1: "Benchmark keyword: resume builder",
              headings: ["Search visibility", "Top competitors"],
              paragraphs: [
                'Resume Builder Offline (com.nanocv.app) appears at Play Store search rank #17 for "resume builder".',
                "Top visible competitors for this keyword include Resume Builder - CV Maker, Resume Builder Pro with AI, Resume - Intelligent CV maker."
              ],
              capturedAt: "2026-03-21T13:01:00.000Z"
            }
          },
          {
            title: "Resume Builder - CV Maker",
            url: "https://play.google.com/store/apps/details?id=com.example.a",
            snippet: 'Play Store search rank #1 for keyword "resume builder". AI resume templates and PDF export.',
            site: "play.google.com",
            reviewStatus: "read"
          },
          {
            title: "Resume Builder Pro with AI",
            url: "https://play.google.com/store/apps/details?id=com.example.b",
            snippet: 'Play Store search rank #2 for keyword "resume builder". AI resume builder with templates.',
            site: "play.google.com",
            reviewStatus: "read"
          }
        ]
      }
    ];

    const report = renderReport(state, createSampleEvidence());
    assert.match(report, /## ASO Audit/);
    assert.match(report, /### Current Listing/);
    assert.match(report, /Title: Resume Builder Offline/);
    assert.match(report, /Play Store search rank #17/i);
    assert.match(report, /### Rewritten ASO Proposal/);
    assert.match(report, /Proposed Title:/);
    assert.match(report, /Input Source: AppBrain URL provided/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("android opportunity workflow brief includes monetization and validation hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-android-brief-"));

  try {
    const state = createWorkflowState(tempDir, "android-opportunity");
    fs.writeFileSync(state.reportPath, "# Final Report\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.researchSummaryPath!), { recursive: true });
    fs.writeFileSync(state.outputs.researchSummaryPath!, "# Research Summary\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.planPath!), { recursive: true });
    fs.writeFileSync(state.outputs.planPath!, '{"version":1}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.postDraftPath!), { recursive: true });
    fs.writeFileSync(state.outputs.postDraftPath!, "# Draft\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.commentsDraftPath!), { recursive: true });
    fs.writeFileSync(state.outputs.commentsDraftPath!, "[]\n", "utf8");
    fs.mkdirSync(path.join(tempDir, "raw", "research"), { recursive: true });
    fs.mkdirSync(path.dirname(state.outputs.pipelineManifestPath!), { recursive: true });
    fs.writeFileSync(state.outputs.pipelineManifestPath!, '{"version":2}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.packageManifestPath!), { recursive: true });
    fs.writeFileSync(state.outputs.packageManifestPath!, '{"placeholder":true}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.packageReadmePath!), { recursive: true });
    fs.writeFileSync(state.outputs.packageReadmePath!, "# Placeholder\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.promptTracePath!), { recursive: true });
    fs.writeFileSync(state.outputs.promptTracePath!, '{\n  "version": 1,\n  "updatedAt": "2026-03-20T12:00:00.000Z",\n  "traces": []\n}\n', "utf8");

    const written = writeWorkflowPackageArtifacts(state, createSampleEvidence());
    const workflowBrief = fs.readFileSync(String(written.workflowBriefPath), "utf8");
    assert.match(workflowBrief, /## Monetization Ideas/);
    assert.match(workflowBrief, /## Validation Checklist/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("market opportunity workflow brief includes pricing and validation hints", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-market-brief-"));

  try {
    const state = createWorkflowState(tempDir, "market-opportunity");
    fs.writeFileSync(state.reportPath, "# Final Report\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.researchSummaryPath!), { recursive: true });
    fs.writeFileSync(state.outputs.researchSummaryPath!, "# Research Summary\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.planPath!), { recursive: true });
    fs.writeFileSync(state.outputs.planPath!, '{"version":1}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.postDraftPath!), { recursive: true });
    fs.writeFileSync(state.outputs.postDraftPath!, "# Draft\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.commentsDraftPath!), { recursive: true });
    fs.writeFileSync(state.outputs.commentsDraftPath!, "[]\n", "utf8");
    fs.mkdirSync(path.join(tempDir, "raw", "research"), { recursive: true });
    fs.mkdirSync(path.dirname(state.outputs.pipelineManifestPath!), { recursive: true });
    fs.writeFileSync(state.outputs.pipelineManifestPath!, '{"version":2}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.packageManifestPath!), { recursive: true });
    fs.writeFileSync(state.outputs.packageManifestPath!, '{"placeholder":true}\n', "utf8");
    fs.mkdirSync(path.dirname(state.outputs.packageReadmePath!), { recursive: true });
    fs.writeFileSync(state.outputs.packageReadmePath!, "# Placeholder\n", "utf8");
    fs.mkdirSync(path.dirname(state.outputs.promptTracePath!), { recursive: true });
    fs.writeFileSync(state.outputs.promptTracePath!, '{\n  "version": 1,\n  "updatedAt": "2026-03-20T12:00:00.000Z",\n  "traces": []\n}\n', "utf8");

    const written = writeWorkflowPackageArtifacts(state, createSampleEvidence());
    const workflowBrief = fs.readFileSync(String(written.workflowBriefPath), "utf8");
    assert.match(workflowBrief, /## Pricing Ideas/);
    assert.match(workflowBrief, /## Validation Checklist/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("research summary renders human-readable evidence references", () => {
  const summary = {
    executiveSummary: "Research summary.",
    keyFindings: ["Users want less manual setup."],
    contentAngles: ["Position the product as zero-friction."],
    keyFindingDetails: [
      {
        text: "Users want less manual setup.",
        evidenceIds: ["ext_alpha"]
      }
    ],
    contentAngleDetails: [
      {
        text: "Position the product as zero-friction.",
        evidenceIds: ["src_beta"]
      }
    ],
    referencedEvidence: [
      {
        id: "ext_alpha",
        sourceId: "src_beta",
        query: "ai study planner friction",
        sourceTitle: "Forum thread",
        sourceUrl: "https://example.com/forum-thread",
        kind: "feature_request" as const,
        value: "I just want to throw my tasks in and get a plan",
        confidence: 0.86,
        overallScore: 0.82
      },
      {
        id: "src_beta",
        sourceId: "src_beta",
        query: "ai study planner friction",
        sourceTitle: "Forum thread",
        sourceUrl: "https://example.com/forum-thread",
        kind: "source" as const,
        value: "Forum thread",
        overallScore: 0.82
      }
    ]
  };

  const rendered = renderResearchSummary(summary);

  assert.match(rendered, /Evidence: E1/);
  assert.match(rendered, /Evidence: S1/);
  assert.match(rendered, /\[E1\] feature_request/);
  assert.match(rendered, /\[S1\] source/);
  assert.ok(!rendered.includes("ext_alpha"));
  assert.ok(!rendered.includes("src_beta"));
});
