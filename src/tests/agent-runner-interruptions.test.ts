import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTaskState, saveTaskState } from "../lib/cache";
import {
  closeSharedJobDatabase,
  getStoredJobDetail,
  JobStore,
  listJobRunEvents,
  requestStoredJobControl
} from "../lib/job-store";
import { createPipelineState } from "../tasks/agent/pipeline-state";
import type {
  AgentPlan,
  AgentResearchResult,
  AgentResearchSummary,
  AgentRunState,
  JobControlAction
} from "../types";
import { buildAgentOutputPaths } from "../workflows/output-package";

const cdpModule = require("../lib/cdp") as typeof import("../lib/cdp");

function createPlan(input: {
  researchQueries: string[];
}): AgentPlan {
  return {
    summary: "Test plan",
    tone: "direct",
    estimatedMinutes: 12,
    approvalRequired: false,
    deliverables: ["report"],
    researchQueries: input.researchQueries,
    steps: [
      {
        id: "step_research",
        kind: "research",
        title: "Research the topic",
        goal: "Collect evidence",
        status: "pending"
      },
      {
        id: "step_report",
        kind: "report",
        title: "Write report",
        goal: "Package the findings",
        status: "pending"
      }
    ]
  };
}

function createState(input: {
  runId: string;
  reportPath: string;
  instruction?: string;
  plan: AgentPlan;
}): AgentRunState {
  const timestamp = "2026-03-21T09:00:00.000Z";
  const artifactDir = path.dirname(input.reportPath);
  const outputPaths = buildAgentOutputPaths(artifactDir);

  return {
    task: "agent",
    runId: input.runId,
    startedAt: timestamp,
    updatedAt: timestamp,
    status: "planning",
    input: {
      instruction: input.instruction ?? "Research interruption handling",
      memoryPath: null,
      maxQueries: 3,
      maxResultsPerQuery: 8,
      fetchBatchSize: 4,
      researchDurationMinutes: null,
      maxRuntimeHours: 4,
      workflowName: "agent-runner",
      workflowPresetId: null,
      workflowTemplateId: null,
      workflowInputs: {},
      jobTitle: "Interruption Test"
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
      executionDeadlineAt: "2026-03-21T13:00:00.000Z"
    },
    reportPath: input.reportPath,
    artifactDir,
    plan: input.plan,
    pipeline: createPipelineState(),
    research: [],
    researchSummary: null,
    outputs: {
      planPath: outputPaths.planPath,
      pipelineManifestPath: outputPaths.pipelineManifestPath,
      researchSummaryPath: outputPaths.researchSummaryPath,
      postDraftPath: outputPaths.postDraftPath,
      commentsDraftPath: outputPaths.commentsDraftPath,
      workflowBriefPath: outputPaths.workflowBriefPath,
      packageManifestPath: outputPaths.packageManifestPath,
      packageReadmePath: outputPaths.packageReadmePath,
      promptTracePath: outputPaths.promptTracePath
    },
    notes: []
  };
}

function createRunner(cachePath: string, reportPath: string) {
  const { AgentRunnerTask } = require("../tasks/agent-runner") as typeof import("../tasks/agent-runner");
  return new AgentRunnerTask({
    instruction: "Research interruption handling",
    resume: true,
    cachePath,
    reportPath,
    maxQueries: 3,
    maxResultsPerQuery: 8,
    fetchBatchSize: 4,
    maxRuntimeHours: 4
  });
}

function installControlTrigger(input: {
  action: JobControlAction;
  triggerCall: number;
  databasePath: string;
}) {
  const original = JobStore.prototype.getPendingControlAction;
  let calls = 0;

  JobStore.prototype.getPendingControlAction = function patchedGetPendingControlAction() {
    calls += 1;
    if (calls === input.triggerCall) {
      requestStoredJobControl({
        databasePath: input.databasePath,
        jobId: (this as unknown as { jobId: string }).jobId,
        action: input.action
      });
    }
    return original.call(this);
  };

  return () => {
    JobStore.prototype.getPendingControlAction = original;
  };
}

function installRunnerTestStubs() {
  const { LlmService } = require("../lib/llm") as typeof import("../lib/llm");
  const { AgentSearchStage } = require("../tasks/agent/search-stage") as typeof import("../tasks/agent/search-stage");
  const originalEnsureDebuggerReady = cdpModule.ensureDebuggerReady;
  const originalSynthesizeAgentEvidence = LlmService.prototype.synthesizeAgentEvidence;
  const originalSearch = AgentSearchStage.prototype.search;

  cdpModule.ensureDebuggerReady = async () => {};
  LlmService.prototype.synthesizeAgentEvidence = async function synthesizeStub() {
    return {
      executiveSummary: "Evidence-backed summary for interruption testing.",
      keyFindings: ["Repeated demand for export automation."],
      contentAngles: ["How builders can prioritize automation gaps."],
      keyFindingDetails: [],
      contentAngleDetails: [],
      referencedEvidence: []
    } satisfies AgentResearchSummary;
  };
  AgentSearchStage.prototype.search = async function searchStub(query: string) {
    return {
      query,
      searchedAt: "2026-03-21T09:01:00.000Z",
      searchUrl: `https://search.example.com?q=${encodeURIComponent(query)}`,
      searchProvider: "fixture_search",
      pagesVisited: 1,
      exhausted: true,
      results: [
        {
          title: "Fixture source for interruption testing",
          url: "https://docs.example.com/interruption-fixture",
          snippet: "Teams repeatedly ask for durable research recovery.",
          site: "docs.example.com",
          reviewStatus: "read",
          contentType: "documentation",
          page: {
            title: "Interruption fixture",
            url: "https://docs.example.com/interruption-fixture",
            description: "A deterministic fixture for interrupted research tests.",
            h1: "Interruption fixture",
            headings: ["Recovery"],
            paragraphs: ["Teams repeatedly ask for durable research recovery and clear evidence trails."],
            capturedAt: "2026-03-21T09:01:00.000Z"
          }
        }
      ]
    } as Awaited<ReturnType<typeof originalSearch>>;
  };

  return () => {
    cdpModule.ensureDebuggerReady = originalEnsureDebuggerReady;
    LlmService.prototype.synthesizeAgentEvidence = originalSynthesizeAgentEvidence;
    AgentSearchStage.prototype.search = originalSearch;
  };
}

function persistEvidenceFixture(databasePath: string, state: AgentRunState): void {
  const store = new JobStore({
    databasePath,
    jobId: state.runId,
    taskType: "agent",
    workflowName: state.input.workflowName ?? "agent-runner",
    title: state.input.jobTitle ?? state.input.instruction,
    instruction: state.input.instruction,
    status: "running",
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    cachePath: path.join(state.artifactDir, "..", `${state.runId}.json`),
    reportPath: state.reportPath,
    artifactDir: state.artifactDir,
    input: state.input,
    budget: {
      maxQueries: state.input.maxQueries,
      maxResultsPerQuery: state.input.maxResultsPerQuery,
      fetchBatchSize: state.input.fetchBatchSize,
      maxRuntimeHours: state.input.maxRuntimeHours,
      leaseTtlSeconds: state.runtime.leaseTtlSeconds
    },
    output: {}
  });

  const timestamp = "2026-03-21T09:05:00.000Z";
  const result: AgentResearchResult = {
    query: "android export automation demand",
    searchedAt: timestamp,
    results: [
      {
        title: "Builders keep asking for export automation",
        url: "https://docs.example.com/export-automation",
        snippet: "Teams keep asking for CSV export and scheduled export automation.",
        site: "docs.example.com",
        reviewStatus: "read",
        contentType: "documentation",
        page: {
          title: "Export automation guide",
          url: "https://docs.example.com/export-automation",
          description: "A guide describing export limitations and workarounds.",
          h1: "Export automation guide",
          headings: ["Export automation", "CSV workflows"],
          paragraphs: [
            "Teams complain that CSV export is missing from the current release.",
            "Multiple operators request scheduled exports and better automation for reporting."
          ],
          capturedAt: timestamp
        }
      }
    ]
  };

  store.persistAgentResearchResult(result, {
    searchProvider: "fixture_search",
    searchUrl: "https://search.example.com?q=android+export+automation+demand",
    getExtractionCandidates: () => [
      {
        kind: "complaint",
        value: "CSV export is missing",
        evidenceText: "Teams complain that CSV export is missing from the current release.",
        confidence: 0.91,
        method: "fixture_extractor"
      },
      {
        kind: "feature_request",
        value: "scheduled exports",
        evidenceText: "Multiple operators request scheduled exports and better automation for reporting.",
        confidence: 0.88,
        method: "fixture_extractor"
      }
    ]
  });
}

test("agent runner pauses cleanly during research checkpoints", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-runner-pause-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const cachePath = path.join(tempDir, "agent-cache.json");
  const reportPath = path.join(tempDir, "artifacts", "report.md");
  const previousEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    databasePath: process.env.WEB_TASK_AGENT_DB_PATH
  };

  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
  process.env.WEB_TASK_AGENT_DB_PATH = databasePath;

  const restoreStubs = installRunnerTestStubs();
  const restoreControlTrigger = installControlTrigger({
    action: "pause",
    triggerCall: 3,
    databasePath
  });

  try {
    const state = createState({
      runId: "job_pause_research",
      reportPath,
      plan: createPlan({
        researchQueries: ["android export automation demand"]
      })
    });
    saveTaskState("agent", cachePath, state);

    const result = await createRunner(cachePath, reportPath).run();
    assert.equal(result.status, "paused");

    const savedState = loadTaskState<AgentRunState>(cachePath);
    assert.equal(savedState.status, "paused");
    assert.equal(savedState.plan?.steps.find((step) => step.kind === "research")?.status, "pending");

    const detail = getStoredJobDetail({
      databasePath,
      jobId: state.runId
    });
    assert.ok(detail);
    assert.equal(detail.job.status, "paused");

    const events = listJobRunEvents({
      databasePath,
      jobId: state.runId,
      limit: 50
    });
    assert.ok(events.some((event) => event.eventType === "control_requested"));
    assert.ok(events.some((event) => event.eventType === "control_applied"));
    assert.equal(fs.existsSync(reportPath), false);

    const resumedResult = await createRunner(cachePath, reportPath).run();
    assert.equal(resumedResult.status, "completed");
    assert.equal(fs.existsSync(reportPath), true);

    const resumedDetail = getStoredJobDetail({
      databasePath,
      jobId: state.runId
    });
    assert.ok(resumedDetail);
    assert.equal(resumedDetail.job.status, "completed");
  } finally {
    restoreControlTrigger();
    restoreStubs();
    closeSharedJobDatabase(databasePath);
    process.env.ANTHROPIC_API_KEY = previousEnv.apiKey;
    process.env.ANTHROPIC_BASE_URL = previousEnv.baseUrl;
    process.env.WEB_TASK_AGENT_DB_PATH = previousEnv.databasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("agent runner cancels cleanly before the report stage after synthesis", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-runner-cancel-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const cachePath = path.join(tempDir, "agent-cache.json");
  const reportPath = path.join(tempDir, "artifacts", "report.md");
  const previousEnv = {
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    databasePath: process.env.WEB_TASK_AGENT_DB_PATH
  };

  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";
  process.env.WEB_TASK_AGENT_DB_PATH = databasePath;

  const restoreStubs = installRunnerTestStubs();
  const restoreControlTrigger = installControlTrigger({
    action: "cancel",
    triggerCall: 3,
    databasePath
  });

  try {
    const state = createState({
      runId: "job_cancel_report",
      reportPath,
      plan: createPlan({
        researchQueries: []
      })
    });
    saveTaskState("agent", cachePath, state);
    persistEvidenceFixture(databasePath, state);

    const result = await createRunner(cachePath, reportPath).run();
    assert.equal(result.status, "cancelled");

    const savedState = loadTaskState<AgentRunState>(cachePath);
    assert.equal(savedState.status, "cancelled");
    assert.ok(savedState.researchSummary);
    assert.equal(savedState.plan?.steps.find((step) => step.kind === "report")?.status, "skipped");
    assert.equal(fs.existsSync(savedState.outputs.researchSummaryPath ?? ""), true);
    assert.equal(fs.existsSync(reportPath), false);

    const detail = getStoredJobDetail({
      databasePath,
      jobId: state.runId
    });
    assert.ok(detail);
    assert.equal(detail.job.status, "cancelled");

    const events = listJobRunEvents({
      databasePath,
      jobId: state.runId,
      limit: 50
    });
    assert.ok(events.some((event) => event.eventType === "control_requested"));
    assert.ok(events.some((event) => event.eventType === "control_applied"));
  } finally {
    restoreControlTrigger();
    restoreStubs();
    closeSharedJobDatabase(databasePath);
    process.env.ANTHROPIC_API_KEY = previousEnv.apiKey;
    process.env.ANTHROPIC_BASE_URL = previousEnv.baseUrl;
    process.env.WEB_TASK_AGENT_DB_PATH = previousEnv.databasePath;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
