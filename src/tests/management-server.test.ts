import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";

import { enqueueQueuedAgentJob, listQueuedJobs } from "../lib/job-queue";
import { JobStore } from "../lib/job-store";
import { createManagementServer } from "../server/management-server";

test("management server exposes controls and log endpoints", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-server-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const server = createManagementServer({
    databasePath
  });

  try {
    const job = new JobStore({
      databasePath,
      jobId: "job_server",
      taskType: "agent",
      workflowName: "article-research",
      title: "Server Test Job",
      instruction: "Research management server controls",
      status: "paused",
      startedAt: "2026-03-20T10:00:00.000Z",
      updatedAt: "2026-03-20T10:00:00.000Z",
      cachePath: path.join(tempDir, "job_server.json"),
      reportPath: path.join(tempDir, "job_server.md"),
      input: {
        instruction: "Research management server controls",
        memoryPath: null,
        maxQueries: 3,
        maxResultsPerQuery: 10,
        fetchBatchSize: 5,
        maxRuntimeHours: 6,
        workflowName: "article-research",
        workflowPresetId: "standard",
        workflowTemplateId: "article-research",
        workflowInputs: {
          topic: "server controls",
          audience: null,
          context: null
        },
        jobTitle: "Server Test Job"
      },
      budget: {
        maxQueries: 3,
        maxResultsPerQuery: 10,
        fetchBatchSize: 5,
        maxRuntimeHours: 6,
        leaseTtlSeconds: 900
      },
      output: {}
    });
    job.appendRunEvent("log", "server test boot");

    const queued = enqueueQueuedAgentJob({
      databasePath,
      jobId: "job_server",
      payload: {
        taskType: "agent",
        mode: "workflow",
        label: "Server queue item",
        options: {
          instruction: "Research management server controls",
          resume: true,
          cachePath: path.join(tempDir, "job_server.json"),
          reportPath: path.join(tempDir, "job_server.md")
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind management server");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const eventsResponse = await fetch(`${baseUrl}/api/jobs/job_server/events`);
    assert.equal(eventsResponse.status, 200);
    const events = await eventsResponse.json();
    assert.ok(Array.isArray(events));
    assert.ok(events.some((event) => event.message === "server test boot"));

    const queuePauseResponse = await fetch(`${baseUrl}/api/queue/${queued.queueId}/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "pause"
      })
    });
    assert.equal(queuePauseResponse.status, 200);
    const pausedPayload = await queuePauseResponse.json();
    assert.equal(pausedPayload.queue.status, "paused");

    const queueResumeResponse = await fetch(`${baseUrl}/api/queue/${queued.queueId}/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "resume"
      })
    });
    assert.equal(queueResumeResponse.status, 200);
    const resumedPayload = await queueResumeResponse.json();
    assert.equal(resumedPayload.queue.status, "queued");

    const rerunResponse = await fetch(`${baseUrl}/api/jobs/job_server/control`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "rerun"
      })
    });
    assert.equal(rerunResponse.status, 200);
    const rerunPayload = await rerunResponse.json();
    assert.ok(typeof rerunPayload.queueId === "string" && rerunPayload.queueId.length > 0);

    const streamResponse = await fetch(`${baseUrl}/api/jobs/job_server/events/stream`);
    assert.equal(streamResponse.status, 200);
    assert.equal(streamResponse.headers.get("content-type")?.includes("text/event-stream"), true);
    const reader = streamResponse.body?.getReader();
    assert.ok(reader);
    const firstChunk = await reader?.read();
    const firstText = Buffer.from(firstChunk?.value ?? new Uint8Array()).toString("utf8");
    assert.match(firstText, /event: snapshot/);
    await reader?.cancel();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("legacy queued_jobs schema migrates before queue listing", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-migrate-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const db = new DatabaseSync(databasePath);

  try {
    db.exec(`
      CREATE TABLE queued_jobs (
        id TEXT PRIMARY KEY,
        task_type TEXT NOT NULL,
        mode TEXT NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 100,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        run_after TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        result_json TEXT NOT NULL DEFAULT '{}',
        last_error TEXT,
        leased_by TEXT,
        leased_at TEXT,
        lease_expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );
    `);
    db.prepare(`
      INSERT INTO queued_jobs (
        id, task_type, mode, label, status, priority, attempts, max_attempts,
        run_after, payload_json, result_json, last_error, leased_by, leased_at,
        lease_expires_at, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', NULL, NULL, NULL, NULL, ?, ?, NULL)
    `).run(
      "queue_legacy",
      "agent",
      "workflow",
      "Legacy queue row",
      "queued",
      100,
      0,
      3,
      "2026-03-20T10:00:00.000Z",
      JSON.stringify({
        taskType: "agent",
        mode: "workflow",
        label: "Legacy queue row",
        options: {
          instruction: "Legacy queue migration",
          resume: false
        }
      }),
      "2026-03-20T10:00:00.000Z",
      "2026-03-20T10:00:00.000Z"
    );
  } finally {
    db.close();
  }

  try {
    const rows = listQueuedJobs({
      databasePath
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.queueId, "queue_legacy");
    assert.equal(rows[0]?.jobId, null);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
