import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  closeSharedJobDatabase,
  backupJobStore,
  getJobStoreSchemaVersion,
  maintainJobStore,
  restoreJobStore,
  JobStore
} from "../lib/job-store";
import type { AgentResearchResult } from "../types";

test("job store maintenance tracks schema version, canonical urls, and artifact metadata", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-storage-policy-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const artifactPath = path.join(tempDir, "artifacts", "report.md");
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, "# report\n", "utf8");
  let db: DatabaseSync | null = null;

  try {
    const store = new JobStore({
      databasePath,
      jobId: "job_storage_policy",
      taskType: "agent",
      workflowName: null,
      title: "Storage policy test",
      instruction: "Audit storage behavior",
      status: "completed",
      startedAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      cachePath: path.join(tempDir, "cache.json"),
      reportPath: path.join(tempDir, "report.md"),
      artifactDir: tempDir,
      input: {},
      budget: {},
      output: {}
    });

    store.registerArtifact("report", "markdown_report", artifactPath, {
      kind: "report"
    });

    const research: AgentResearchResult = {
      query: "storage canonical url audit",
      searchedAt: "2026-03-20T10:15:00.000Z",
      results: [
        {
          title: "Canonical storage page",
          url: "https://www.example.com/index.html?utm_source=newsletter#fragment",
          snippet: "Testing canonical URL storage.",
          site: "example.com",
          page: {
            title: "Canonical storage page",
            url: "https://www.example.com/index.html?utm_source=newsletter#fragment",
            description: "Testing canonical URL storage.",
            h1: "Canonical storage page",
            headings: ["Storage policy", "Source canonicalization"],
            paragraphs: [
              "Testing canonical URL storage with a page snapshot that should dedupe tracking parameters."
            ],
            capturedAt: "2026-03-20T10:15:01.000Z"
          }
        }
      ]
    };

    store.persistAgentResearchResult(research, {
      searchProvider: "test_search",
      searchUrl: "https://search.example.com/?q=storage",
      extractorId: "test_extractor",
      extractorOrigin: "best_effort"
    });

    const summary = maintainJobStore({
      databasePath
    });
    assert.equal(summary.schemaVersion, 2);
    assert.equal(summary.jobs, 1);
    assert.equal(summary.artifacts, 1);
    assert.equal(summary.vacuumed, false);

    db = new DatabaseSync(databasePath);
    const sourceRow = db.prepare(`
      SELECT canonical_url, raw_url
      FROM sources
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    assert.ok(sourceRow);
    assert.equal(String(sourceRow?.canonical_url ?? ""), "https://example.com/");
    assert.equal(
      String(sourceRow?.raw_url ?? ""),
      "https://www.example.com/index.html?utm_source=newsletter#fragment"
    );

    const artifactRow = db.prepare(`
      SELECT metadata_json
      FROM job_artifacts
      WHERE artifact_key = 'report'
    `).get() as Record<string, unknown> | undefined;
    assert.ok(artifactRow);
    const metadata = JSON.parse(String(artifactRow?.metadata_json ?? "{}")) as {
      absolutePath?: string;
      exists?: boolean;
      sizeBytes?: number | null;
      kind?: string;
    };
    assert.equal(metadata.kind, "report");
    assert.equal(metadata.exists, true);
    assert.equal(metadata.absolutePath, path.resolve(artifactPath));
    assert.ok((metadata.sizeBytes ?? 0) > 0);

    const extractionRow = db.prepare(`
      SELECT metadata_json
      FROM extractions
      LIMIT 1
    `).get() as Record<string, unknown> | undefined;
    assert.ok(extractionRow);
    const extractionMetadata = JSON.parse(String(extractionRow?.metadata_json ?? "{}")) as {
      extractorId?: string;
      extractorOrigin?: string;
      extractionGate?: string;
      extractionSignals?: string[];
    };
    assert.equal(extractionMetadata.extractorId, "test_extractor");
    assert.equal(extractionMetadata.extractorOrigin, "best_effort");
    assert.equal(extractionMetadata.extractionGate, "page has enough readable content");
    assert.ok((extractionMetadata.extractionSignals ?? []).length > 0);

    assert.throws(() => store.setStatus("running"));
    assert.equal(getJobStoreSchemaVersion({ databasePath }), 2);
  } finally {
    db?.close();
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("storage backup and restore preserve a consistent prior database with a safety copy", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-storage-backup-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const backupPath = path.join(tempDir, "backup.sqlite");

  try {
    new JobStore({
      databasePath,
      jobId: "job_original",
      taskType: "agent",
      workflowName: null,
      title: "Original job",
      instruction: null,
      status: "completed",
      startedAt: "2026-08-26T10:00:00.000Z",
      input: {},
      budget: {},
      output: {}
    });
    const backup = backupJobStore({ databasePath, outputPath: backupPath });
    assert.ok(backup.sizeBytes > 0);

    new JobStore({
      databasePath,
      jobId: "job_after_backup",
      taskType: "agent",
      workflowName: null,
      title: "Later job",
      instruction: null,
      status: "completed",
      startedAt: "2026-08-26T10:01:00.000Z",
      input: {},
      budget: {},
      output: {}
    });
    const restored = restoreJobStore({ databasePath, inputPath: backupPath, force: true });
    assert.ok(restored.safetyBackupPath);
    assert.equal(maintainJobStore({ databasePath }).jobs, 1);
    assert.throws(
      () => restoreJobStore({ databasePath, inputPath: backupPath, force: false }),
      /pass --force/
    );
  } finally {
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
