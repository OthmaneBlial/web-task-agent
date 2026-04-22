import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeSharedJobDatabase, JobStore } from "../lib/job-store";
import type { AgentResearchResult } from "../types";

function createStore(tempDir: string, jobId: string): JobStore {
  return new JobStore({
    databasePath: path.join(tempDir, "jobs.sqlite"),
    jobId,
    taskType: "agent",
    workflowName: "article-research",
    title: "Scoring balance test",
    instruction: "Tune freshness and authority scoring",
    status: "running",
    startedAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    artifactDir: tempDir,
    cachePath: path.join(tempDir, "cache.json"),
    reportPath: path.join(tempDir, "report.md"),
    input: {},
    budget: {},
    output: {}
  });
}

test("fresh sources score above stale sources when content is comparable", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-freshness-"));

  try {
    const store = createStore(tempDir, "job_freshness");
    const research: AgentResearchResult = {
      query: "freshness balance",
      searchedAt: "2026-03-20T10:05:00.000Z",
      results: [
        {
          title: "Recent export guide",
          url: "https://docs.example.com/recent-export",
          snippet: "A recent guide about export automation.",
          site: "docs.example.com",
          reviewStatus: "read",
          qualityScore: 0.86,
          page: {
            title: "Recent export guide",
            url: "https://docs.example.com/recent-export",
            description: "A fresh guide about export automation.",
            h1: "Recent export guide",
            headings: ["Export automation"],
            paragraphs: [
              "Export automation keeps reporting fresh and reduces manual work.",
              "The guide focuses on reusable workflows."
            ],
            capturedAt: "2026-03-20T10:05:01.000Z"
          }
        },
        {
          title: "Older export guide",
          url: "https://docs.example.com/older-export",
          snippet: "An older guide about export automation.",
          site: "docs.example.com",
          reviewStatus: "read",
          qualityScore: 0.86,
          page: {
            title: "Older export guide",
            url: "https://docs.example.com/older-export",
            description: "An older guide about export automation.",
            h1: "Older export guide",
            headings: ["Export automation"],
            paragraphs: [
              "Export automation keeps reporting fresh and reduces manual work.",
              "The guide focuses on reusable workflows."
            ],
            capturedAt: "2026-01-01T10:05:01.000Z"
          }
        }
      ]
    };

    store.persistAgentResearchResult(research, {
      searchProvider: "test_search",
      searchUrl: "https://search.example.com/?q=freshness+balance"
    });

    const evidence = store.getAgentEvidenceBundle();
    const fresh = evidence.sources.find((source) => source.url.includes("/recent-export"));
    const stale = evidence.sources.find((source) => source.url.includes("/older-export"));

    assert.ok(fresh);
    assert.ok(stale);
    assert.ok((fresh?.freshnessScore ?? 0) > (stale?.freshnessScore ?? 0));
    assert.ok((fresh?.overallScore ?? 0) >= (stale?.overallScore ?? 0));
  } finally {
    closeSharedJobDatabase(path.join(tempDir, "jobs.sqlite"));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("trusted documentation scores above a generic blog when freshness matches", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-authority-"));

  try {
    const store = createStore(tempDir, "job_authority");
    const research: AgentResearchResult = {
      query: "authority balance",
      searchedAt: "2026-03-20T10:05:00.000Z",
      results: [
        {
          title: "Export workflow guide",
          url: "https://docs.example.com/export-workflow",
          snippet: "A documentation guide for export workflows.",
          site: "docs.example.com",
          reviewStatus: "read",
          qualityScore: 0.84,
          page: {
            title: "Export workflow guide",
            url: "https://docs.example.com/export-workflow",
            description: "A documentation guide for export workflows.",
            h1: "Export workflow guide",
            headings: ["Export workflows"],
            paragraphs: [
              "Export workflows keep reporting reliable and easy to audit.",
              "The guide explains how to reuse the same output package."
            ],
            capturedAt: "2026-03-20T10:05:01.000Z"
          }
        },
        {
          title: "Export workflow notes",
          url: "https://blog.example.com/export-workflow-notes",
          snippet: "A generic blog post about export workflows.",
          site: "blog.example.com",
          reviewStatus: "read",
          qualityScore: 0.84,
          page: {
            title: "Export workflow notes",
            url: "https://blog.example.com/export-workflow-notes",
            description: "A generic blog post about export workflows.",
            h1: "Export workflow notes",
            headings: ["Export workflows"],
            paragraphs: [
              "Export workflows keep reporting reliable and easy to audit.",
              "The post explains how to reuse the same output package."
            ],
            capturedAt: "2026-03-20T10:05:01.000Z"
          }
        }
      ]
    };

    store.persistAgentResearchResult(research, {
      searchProvider: "test_search",
      searchUrl: "https://search.example.com/?q=authority+balance"
    });

    const evidence = store.getAgentEvidenceBundle();
    const docs = evidence.sources.find((source) => source.url.includes("docs.example.com"));
    const blog = evidence.sources.find((source) => source.url.includes("blog.example.com"));

    assert.ok(docs);
    assert.ok(blog);
    assert.ok((docs?.sourceQualityScore ?? 0) > (blog?.sourceQualityScore ?? 0));
    assert.ok((docs?.overallScore ?? 0) >= (blog?.overallScore ?? 0));
  } finally {
    closeSharedJobDatabase(path.join(tempDir, "jobs.sqlite"));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
