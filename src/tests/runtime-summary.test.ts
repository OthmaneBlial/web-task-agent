import assert from "node:assert/strict";
import test from "node:test";

import { formatStoredJobRuntimeSummary } from "../lib/runtime-summary";

test("stored job runtime summary keeps the key status facts in one line", () => {
  const summary = formatStoredJobRuntimeSummary({
    job: {
      jobId: "job_123",
      taskType: "agent",
      workflowName: "article-research",
      title: "Test job",
      instruction: "Test instruction",
      status: "running",
      cachePath: null,
      reportPath: "/tmp/report.md",
      artifactDir: "/tmp/artifacts",
      errorMessage: null,
      startedAt: "2026-04-22T10:00:00.000Z",
      updatedAt: "2026-04-22T10:05:00.000Z",
      completedAt: null,
      controlAction: "pause",
      controlRequestedAt: "2026-04-22T10:04:30.000Z",
      input: {},
      budget: {},
      output: {}
    },
    steps: [
      {
        stepKey: "plan",
        position: 1,
        title: "Plan",
        kind: "plan",
        status: "completed",
        attemptCount: 1,
        startedAt: "2026-04-22T10:00:00.000Z",
        updatedAt: "2026-04-22T10:01:00.000Z",
        completedAt: "2026-04-22T10:01:00.000Z",
        durationMs: 60000,
        errorMessage: null,
        input: {},
        output: {}
      }
    ],
    artifacts: [
      {
        artifactKey: "report",
        artifactType: "markdown_report",
        path: "/tmp/report.md",
        metadata: {},
        createdAt: "2026-04-22T10:05:00.000Z",
        updatedAt: "2026-04-22T10:05:00.000Z"
      }
    ],
    events: [
      {
        id: "event_1",
        eventType: "log",
        message: "Working",
        metadata: {},
        createdAt: "2026-04-22T10:01:00.000Z"
      }
    ],
    evidenceGraph: {
      nodes: 4,
      edges: 5,
      danglingEdges: 1,
      orphanNodes: 2
    }
  });

  assert.equal(
    summary,
    "running agent job / article-research | 1 steps | 1 artifacts | 1 events | 4 nodes, 5 edges, 3 graph issues, control pause requested"
  );
});
