import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { getStoredJobDetail, JobStore, closeSharedJobDatabase } from "../lib/job-store";
import type { AgentResearchResult } from "../types";

test("stored evidence graph reports no dangling or orphaned nodes for a healthy job", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-graph-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const store = new JobStore({
      databasePath,
      jobId: "job_graph",
      taskType: "agent",
      workflowName: "article-research",
      title: "Graph Integrity Test",
      instruction: "Validate evidence graph consistency",
      status: "completed",
      startedAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      completedAt: "2026-03-20T10:10:00.000Z",
      artifactDir: tempDir,
      cachePath: path.join(tempDir, "cache.json"),
      reportPath: path.join(tempDir, "report.md"),
      input: {},
      budget: {},
      output: {}
    });

    const research: AgentResearchResult = {
      query: "workflow graph consistency",
      searchedAt: "2026-03-20T10:05:00.000Z",
      results: [
        {
          title: "Graph consistency guide",
          url: "https://docs.example.com/graph-consistency",
          snippet: "The guide explains how graph consistency improves output reuse.",
          site: "docs.example.com",
          reviewStatus: "read",
          qualityScore: 0.9,
          page: {
            title: "Graph consistency guide",
            url: "https://docs.example.com/graph-consistency",
            description: "A guide about graph consistency and output reuse.",
            h1: "Graph consistency guide",
            headings: ["Why consistency matters"],
            paragraphs: [
              "Graph consistency improves output reuse and keeps artifacts linked to the right source.",
              "The workflow helps teams audit stored outputs quickly."
            ],
            capturedAt: "2026-03-20T10:05:01.000Z"
          }
        }
      ]
    };

    store.persistAgentResearchResult(research, {
      searchProvider: "test_search",
      searchUrl: "https://search.example.com/?q=workflow+graph+consistency"
    });

    const detail = getStoredJobDetail({
      databasePath,
      jobId: "job_graph"
    });

    assert.ok(detail);
    assert.equal(detail?.evidenceGraph.danglingEdges, 0);
    assert.equal(detail?.evidenceGraph.orphanNodes, 0);
    assert.ok((detail?.evidenceGraph.nodes ?? 0) > 0);
    assert.ok((detail?.evidenceGraph.edges ?? 0) > 0);
  } finally {
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
