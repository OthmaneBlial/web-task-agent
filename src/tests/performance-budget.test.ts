import assert from "node:assert/strict";
import test from "node:test";

import { formatStoredJobPerformanceBudgetLines } from "../lib/performance-budget";

test("performance budget reports highlight slow search and fetch stages", () => {
  const lines = formatStoredJobPerformanceBudgetLines({
    job: {
      jobId: "job_1",
      taskType: "agent",
      workflowName: "article-research",
      title: "Budget test",
      instruction: "Inspect me",
      status: "running",
      cachePath: null,
      reportPath: null,
      artifactDir: null,
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
    steps: [
      {
        stepKey: "search",
        position: 1,
        title: "Search sources",
        kind: "search",
        status: "completed",
        attemptCount: 1,
        startedAt: "2026-04-22T12:00:00.000Z",
        updatedAt: "2026-04-22T12:04:00.000Z",
        completedAt: "2026-04-22T12:04:00.000Z",
        durationMs: 240000,
        errorMessage: null,
        input: {},
        output: {}
      },
      {
        stepKey: "fetch",
        position: 2,
        title: "Fetch pages",
        kind: "fetch",
        status: "completed",
        attemptCount: 1,
        startedAt: "2026-04-22T12:04:00.000Z",
        updatedAt: "2026-04-22T12:14:00.000Z",
        completedAt: "2026-04-22T12:14:00.000Z",
        durationMs: 600000,
        errorMessage: null,
        input: {},
        output: {}
      }
    ],
    artifacts: [],
    events: [],
    runtimeSummary: "running agent job / article-research | 2 steps | 0 artifacts | 0 events | 0 nodes, 0 edges",
    evidenceGraph: {
      nodes: 0,
      edges: 0,
      danglingEdges: 0,
      orphanNodes: 0
    }
  });

  assert.ok(lines.includes("Performance Budget: job_1"));
  assert.ok(lines.some((line) => line.includes("- Search: 4m / 2m (over)")));
  assert.ok(lines.some((line) => line.includes("- Fetch: 10m / 8m (over)")));
  assert.ok(lines.some((line) => line.includes("Warnings: search, fetch exceed the soft budget")));
});
