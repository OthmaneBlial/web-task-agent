import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildJobExportData,
  compareJobExports,
  renderJobComparison,
  renderJobExport
} from "../lib/job-export";
import type { StoredJobDetail } from "../lib/job-store";

function createDetail(input: { id: string; cachePath: string; reportPath: string }): StoredJobDetail {
  return {
    job: {
      jobId: input.id,
      taskType: "agent",
      workflowName: "article-research",
      title: `Research ${input.id}`,
      instruction: "Inspect durable research",
      status: "completed",
      cachePath: input.cachePath,
      reportPath: input.reportPath,
      artifactDir: path.dirname(input.reportPath),
      errorMessage: null,
      startedAt: "2026-08-26T10:00:00.000Z",
      updatedAt: "2026-08-26T10:01:00.000Z",
      completedAt: "2026-08-26T10:01:00.000Z",
      controlAction: null,
      controlRequestedAt: null,
      input: {},
      budget: {},
      output: {}
    },
    steps: [
      {
        stepKey: "research",
        position: 1,
        title: "Research",
        kind: "research",
        status: "completed",
        attemptCount: 1,
        startedAt: "2026-08-26T10:00:00.000Z",
        updatedAt: "2026-08-26T10:01:00.000Z",
        completedAt: "2026-08-26T10:01:00.000Z",
        durationMs: 1000,
        errorMessage: null,
        input: {},
        output: {}
      }
    ],
    artifacts: [],
    events: [],
    runtimeSummary: "completed agent job",
    evidenceGraph: { nodes: 2, edges: 1, danglingEdges: 0, orphanNodes: 0 }
  };
}

function writeResearchCache(filePath: string, sources: Array<{ title: string; url: string }>): void {
  fs.writeFileSync(filePath, JSON.stringify({
    research: [{
      query: "research receipt",
      searchedAt: "2026-08-26T10:00:00.000Z",
      results: sources.map((source) => ({ ...source, site: "example.com", reviewStatus: "read", qualityScore: 0.9 }))
    }]
  }), "utf8");
}

test("job export renders local source data in Markdown, JSON, and CSV with redaction", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-export-"));
  try {
    const cachePath = path.join(tempDir, "cache.json");
    const reportPath = path.join(tempDir, "report.md");
    writeResearchCache(cachePath, [{ title: "API token ghp_abcdefghijklmnop", url: "https://docs.example.com/guide" }]);
    fs.writeFileSync(reportPath, "# Report\n\n## Decision\n\nUse evidence receipts before launch.\n", "utf8");

    const data = buildJobExportData(createDetail({ id: "job_export", cachePath, reportPath }), "2026-08-26T10:02:00.000Z");
    assert.equal(data.sources.length, 1);
    assert.match(renderJobExport(data, "markdown"), /Use evidence receipts before launch/);
    assert.match(renderJobExport(data, "csv"), /https:\/\/docs\.example\.com\/guide/);
    assert.doesNotMatch(renderJobExport(data, "json", true), /ghp_abcdefghijklmnop/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("job comparison reports new and disappeared sources plus decision changes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-compare-"));
  try {
    const leftCache = path.join(tempDir, "left.json");
    const rightCache = path.join(tempDir, "right.json");
    const leftReport = path.join(tempDir, "left.md");
    const rightReport = path.join(tempDir, "right.md");
    writeResearchCache(leftCache, [{ title: "Old source", url: "https://docs.example.com/old" }]);
    writeResearchCache(rightCache, [{ title: "New source", url: "https://docs.example.com/new" }]);
    fs.writeFileSync(leftReport, "## Decision\n\nKeep the old direction.\n", "utf8");
    fs.writeFileSync(rightReport, "## Decision\n\nChange the direction.\n", "utf8");

    const comparison = compareJobExports(
      buildJobExportData(createDetail({ id: "job_old", cachePath: leftCache, reportPath: leftReport })),
      buildJobExportData(createDetail({ id: "job_new", cachePath: rightCache, reportPath: rightReport }))
    );
    assert.equal(comparison.newSources[0]?.title, "New source");
    assert.equal(comparison.disappearedSources[0]?.title, "Old source");
    assert.equal(comparison.decisionChanged, true);
    assert.match(renderJobComparison(comparison, "markdown"), /Sources no longer present/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
