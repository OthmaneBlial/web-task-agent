import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { closeSharedJobDatabase, JobStore } from "../lib/job-store";
import type { AgentResearchResult } from "../types";

test("contradictions preserve supporting evidence values", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-contradiction-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const store = new JobStore({
      databasePath,
      jobId: "job_contradiction",
      taskType: "agent",
      workflowName: "article-research",
      title: "Contradiction Test",
      instruction: "Verify contradiction evidence preservation",
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

    const research: AgentResearchResult = {
      query: "export automation contradiction",
      searchedAt: "2026-03-20T10:05:00.000Z",
      results: [
        {
          title: "Export automation guide",
          url: "https://docs.example.com/export-automation",
          snippet: "Teams want export automation that reduces manual work.",
          site: "docs.example.com",
          reviewStatus: "read",
          qualityScore: 0.88,
          page: {
            title: "Export automation guide",
            url: "https://docs.example.com/export-automation",
            description: "A guide about scheduled export workflows.",
            h1: "Export automation guide",
            headings: ["Why automate exports"],
            paragraphs: [
              "Export automation helps teams reduce manual export work and keeps reports fresh.",
              "The workflow improves reliability for recurring exports."
            ],
            capturedAt: "2026-03-20T10:05:01.000Z"
          }
        },
        {
          title: "Export automation complaints",
          url: "https://community.example.com/discussions/export-automation-complaints",
          snippet: "Export automation is slow and painful for the team.",
          site: "community.example.com",
          reviewStatus: "read",
          qualityScore: 0.87,
          page: {
            title: "Export automation complaints",
            url: "https://community.example.com/discussions/export-automation-complaints",
            description: "A discussion about export pain and automation gaps.",
            h1: "Export automation complaints",
            headings: ["Why exports stay manual"],
            paragraphs: [
              "Export automation is slow and painful when teams need recurring reports.",
              "Operators want better automation and fewer repetitive export steps."
            ],
            capturedAt: "2026-03-20T10:05:02.000Z"
          }
        }
      ]
    };

    store.persistAgentResearchResult(research, {
      searchProvider: "test_search",
      searchUrl: "https://search.example.com/?q=export+automation+contradiction"
    });

    const evidence = store.getAgentEvidenceBundle();
    assert.ok(evidence.contradictions.length > 0);

    const contradiction = evidence.contradictions[0];
    assert.ok(contradiction);
    assert.ok((contradiction?.leftEvidenceValues.length ?? 0) > 0);
    assert.ok((contradiction?.rightEvidenceValues.length ?? 0) > 0);
    assert.match(contradiction?.reason ?? "", /opposing stances/i);
  } finally {
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
