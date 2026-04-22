import assert from "node:assert/strict";
import test from "node:test";

import { formatStoredJobRecoveryReportLines } from "../lib/recovery-report";

test("recovery reports recommend resume for recoverable paused jobs", () => {
  const lines = formatStoredJobRecoveryReportLines(
    {
      job: {
        jobId: "job_1",
        taskType: "agent",
        workflowName: "article-research",
        title: "Recoverable job",
        instruction: "Inspect me",
        status: "paused",
        cachePath: "/tmp/cache.json",
        reportPath: "/tmp/report.md",
        artifactDir: "/tmp/artifacts",
        errorMessage: null,
        startedAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-22T12:01:00.000Z",
        completedAt: null,
        controlAction: "pause",
        controlRequestedAt: "2026-04-22T12:00:30.000Z",
        input: {},
        budget: {},
        output: {}
      },
      steps: [],
      artifacts: [],
      events: [
        {
          id: "event_1",
          eventType: "log",
          message: "Paused by operator",
          metadata: {},
          createdAt: "2026-04-22T12:01:00.000Z"
        }
      ],
      runtimeSummary: "paused agent job / article-research | 0 steps | 0 artifacts | 1 events | 0 nodes, 0 edges",
      evidenceGraph: {
        nodes: 0,
        edges: 0,
        danglingEdges: 0,
        orphanNodes: 0
      }
    },
    new Set(["job_1"])
  );

  assert.ok(lines.includes("Recovery Report: job_1"));
  assert.ok(lines.includes("Recoverable: yes"));
  assert.ok(lines.some((line) => line.includes("web-task-agent job resume job_1")));
  assert.ok(lines.some((line) => line.includes("Paused by operator")));
});

test("recovery reports recommend rerun for failed jobs", () => {
  const lines = formatStoredJobRecoveryReportLines({
    job: {
      jobId: "job_2",
      taskType: "agent",
      workflowName: null,
      title: "Failed job",
      instruction: "Inspect me",
      status: "failed",
      cachePath: null,
      reportPath: null,
      artifactDir: null,
      errorMessage: "Something went wrong",
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
    artifacts: [],
    events: [],
    runtimeSummary: "failed agent job | 0 steps | 0 artifacts | 0 events | 0 nodes, 0 edges",
    evidenceGraph: {
      nodes: 0,
      edges: 0,
      danglingEdges: 0,
      orphanNodes: 0
    }
  });

  assert.ok(lines.includes("Recoverable: no"));
  assert.ok(lines.some((line) => line.includes("web-task-agent job rerun job_2")));
  assert.ok(lines.some((line) => line.includes("Something went wrong")));
});
