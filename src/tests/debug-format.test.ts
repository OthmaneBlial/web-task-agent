import assert from "node:assert/strict";
import test from "node:test";

import {
  formatQueuedJobDebugLines,
  formatStoredJobDebugLines
} from "../lib/debug-format";

test("stored job debug lines include runtime and recent event details", () => {
  const lines = formatStoredJobDebugLines({
    job: {
      jobId: "job_1",
      taskType: "agent",
      workflowName: "article-research",
      title: "Debug job",
      instruction: "Inspect me",
      status: "running",
      cachePath: "/tmp/cache.json",
      reportPath: "/tmp/report.md",
      artifactDir: "/tmp/artifacts",
      errorMessage: null,
      startedAt: "2026-04-22T12:00:00.000Z",
      updatedAt: "2026-04-22T12:01:00.000Z",
      completedAt: null,
      controlAction: null,
      controlRequestedAt: null,
      input: {},
      budget: {},
      output: {}
    },
    steps: [],
    artifacts: [
      {
        artifactKey: "report",
        artifactType: "markdown_report",
        path: "/tmp/report.md",
        metadata: {},
        createdAt: "2026-04-22T12:01:00.000Z",
        updatedAt: "2026-04-22T12:01:00.000Z"
      }
    ],
    events: [
      {
        id: "event_1",
        eventType: "log",
        message: "Running",
        metadata: {},
        createdAt: "2026-04-22T12:01:00.000Z"
      }
    ],
    runtimeSummary:
      "running agent job / article-research | 0 steps | 1 artifacts | 1 events | 0 nodes, 0 edges",
    evidenceGraph: {
      nodes: 0,
      edges: 0,
      danglingEdges: 0,
      orphanNodes: 0
    }
  });

  assert.ok(lines.includes("Runtime Summary: running agent job / article-research | 0 steps | 1 artifacts | 1 events | 0 nodes, 0 edges"));
  assert.ok(lines.some((line) => line.includes("Recent Events:")));
  assert.ok(lines.some((line) => line.includes("Artifact Paths:")));
});

test("queued job debug lines surface payload options", () => {
  const lines = formatQueuedJobDebugLines({
    queueId: "queue_1",
    taskType: "agent",
    mode: "workflow",
    label: "Debug queue",
    status: "queued",
    priority: 10,
    attempts: 2,
    maxAttempts: 5,
    runAfter: "2026-04-22T12:00:00.000Z",
    leaseExpiresAt: null,
    jobId: "job_1",
    controlAction: null,
    controlRequestedAt: null,
    payload: {
      taskType: "agent",
      mode: "workflow",
      label: "Debug queue",
      options: {
        instruction: "Inspect me",
        resume: true
      }
    },
    lastError: null,
    createdAt: "2026-04-22T12:00:00.000Z",
    updatedAt: "2026-04-22T12:00:00.000Z"
  });

  assert.ok(lines.includes("Queue ID: queue_1"));
  assert.ok(lines.includes("Payload Options:"));
  assert.ok(lines.some((line) => line.includes("- resume: true")));
});
