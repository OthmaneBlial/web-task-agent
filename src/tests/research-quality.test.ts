import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildHeuristicExtractionCandidates } from "../lib/extraction-heuristics";
import { JobStore } from "../lib/job-store";
import { AgentExtractStage } from "../tasks/agent/extract-stage";
import { createDefaultAgentExtractor } from "../tasks/agent/extractors/heuristic-extractor";
import { assessDocumentQuality, evaluateDomainPolicy } from "../tasks/agent/shared";
import type { AgentResearchResult, AgentSearchResult } from "../types";

function createGoodResult(): AgentSearchResult {
  return {
    title: "CSV export workflow guide",
    url: "https://docs.example.com/guides/csv-export",
    snippet: "Teams use this guide to automate CSV export workflows and reduce manual reporting work.",
    site: "docs.example.com",
    reviewStatus: "read",
    qualityScore: 0.84,
    qualitySignals: ["documentation domain", "multiple paragraphs"],
    page: {
      title: "CSV export workflow guide",
      url: "https://docs.example.com/guides/csv-export",
      description: "A detailed guide that explains how product teams automate CSV exports and scheduled reports.",
      h1: "Automate CSV export workflows",
      headings: ["Why teams export data", "Schedule exports", "Common reporting pitfalls"],
      paragraphs: [
        "Teams often export CSV reports because manual analytics reviews take too much time and create reporting delays across operations and finance.",
        "This guide shows how to schedule exports, avoid duplicate reports, and keep the export schema stable for downstream analysis.",
        "Operators usually want stronger filters, fresher exports, and better audit visibility before they rely on a reporting workflow."
      ],
      capturedAt: "2026-03-20T10:00:00.000Z"
    }
  };
}

function createThinSkippedResult(): AgentSearchResult {
  return {
    title: "Category: CSV exports",
    url: "https://blog.example.com/category/csv-exports",
    snippet: "Browse posts related to CSV exports.",
    site: "blog.example.com",
    reviewStatus: "skipped",
    skipReason: "index-like page",
    policyAction: "deprioritize",
    policyReason: "domain policy: index-like page",
    qualityScore: 0.22,
    qualitySignals: ["index-like path", "thin textual content"],
    page: {
      title: "Category: CSV exports",
      url: "https://blog.example.com/category/csv-exports",
      description: "Archive page for CSV export topics.",
      h1: "Category: CSV exports",
      headings: ["Older posts"],
      paragraphs: ["Browse all CSV export posts in this category."],
      capturedAt: "2026-03-20T10:02:00.000Z"
    }
  };
}

test("domain policy and document quality identify weak research pages", () => {
  const socialPolicy = evaluateDomainPolicy({
    title: "Thread about startup growth",
    url: "https://x.com/example/status/123",
    snippet: "A short thread with opinions.",
    site: "x.com"
  });
  assert.equal(socialPolicy.action, "skip");
  assert.match(socialPolicy.reason, /domain policy/i);

  const quality = assessDocumentQuality(
    {
      title: "Category: CSV exports",
      url: "https://blog.example.com/category/csv-exports",
      snippet: "Browse posts related to CSV exports."
    },
    createThinSkippedResult().page!
  );
  assert.equal(quality.readable, false);
  assert.ok(quality.score < 0.45);
  assert.ok(quality.signals.some((signal) => signal.includes("index") || signal.includes("thin")));
});

test("heuristic extractor skips low-quality results and persists only readable evidence", () => {
  const goodResult = createGoodResult();
  const skippedResult = createThinSkippedResult();

  assert.ok(buildHeuristicExtractionCandidates(goodResult).length > 0);
  assert.equal(buildHeuristicExtractionCandidates(skippedResult).length, 0);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-quality-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const jobStore = new JobStore({
      databasePath,
      jobId: "job_quality",
      taskType: "agent",
      workflowName: "article-research",
      title: "Research Quality Test",
      instruction: "Harden research quality",
      status: "running",
      startedAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      artifactDir: tempDir,
      cachePath: path.join(tempDir, "cache.json"),
      reportPath: path.join(tempDir, "report.md"),
      input: {
        instruction: "Harden research quality"
      },
      budget: {},
      output: {}
    });
    const stage = new AgentExtractStage(
      jobStore,
      tempDir,
      {
        id: "test_search",
        buildSearchUrl: (query) => `https://search.example.com/?q=${encodeURIComponent(query)}`
      },
      createDefaultAgentExtractor()
    );

    const research: AgentResearchResult = {
      query: "csv export automation",
      searchedAt: "2026-03-20T10:05:00.000Z",
      results: [goodResult, skippedResult]
    };

    const persisted = stage.persistQueryResult(research);
    assert.equal(persisted.sourceCount, 2);
    assert.equal(persisted.documentCount, 2);
    assert.ok(persisted.extractionCount > 0);

    const evidence = jobStore.getAgentEvidenceBundle();
    const readableSource = evidence.sources.find((source) =>
      source.url.includes("docs.example.com/guides/csv-export")
    );
    const thinSource = evidence.sources.find((source) =>
      source.url.includes("blog.example.com/category/csv-exports")
    );

    assert.ok(readableSource);
    assert.ok((readableSource?.extractions.length ?? 0) > 0);
    assert.ok(thinSource);
    assert.equal(thinSource?.reviewStatus, "skipped");
    assert.equal(thinSource?.skipReason, "index-like page");
    assert.equal(thinSource?.extractions.length, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
