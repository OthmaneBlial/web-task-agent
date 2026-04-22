import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createOrResumeState, saveTaskState } from "../lib/cache";
import {
  claimNextQueuedJob,
  enqueueQueuedAgentJob,
  getQueuedJobSummary,
  recoverStaleQueuedJobs
} from "../lib/job-queue";

test("stale queued job recovery forces resume from saved cache state", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-recovery-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const cachePath = path.join(tempDir, "agent-cache.json");
  const reportPath = path.join(tempDir, "report.md");
  let queueDb: DatabaseSync | null = null;

  try {
    const queued = enqueueQueuedAgentJob({
      databasePath,
      payload: {
        taskType: "agent",
        mode: "workflow",
        label: "Recovery test",
        options: {
          instruction: "Test stale queue recovery",
          cachePath,
          reportPath,
          resume: false
        }
      }
    });

    const claimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-a",
      leaseTtlSeconds: 60
    });
    assert.ok(claimed);
    assert.equal(claimed.payload.options.resume, false);

    saveTaskState("agent", cachePath, {
      runId: "saved_run",
      marker: "persisted-state"
    });

    queueDb = new DatabaseSync(databasePath);
    queueDb.prepare(`
      UPDATE queued_jobs
      SET lease_expires_at = ?
      WHERE id = ?
    `).run("2000-01-01T00:00:00.000Z", queued.queueId);

    const recoveredCount = recoverStaleQueuedJobs({
      databasePath
    });
    assert.equal(recoveredCount, 1);

    const recoveredPayloadJson = queueDb.prepare(`
      SELECT payload_json
      FROM queued_jobs
      WHERE id = ?
    `).get(queued.queueId) as Record<string, unknown> | undefined;
    assert.ok(recoveredPayloadJson);
    const recoveredPayload = JSON.parse(String(recoveredPayloadJson.payload_json)) as {
      options?: {
        resume?: boolean;
      };
    };
    assert.equal(recoveredPayload.options?.resume, true);

    const reclaimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-b",
      leaseTtlSeconds: 60
    });
    assert.ok(reclaimed);
    assert.equal(reclaimed.payload.options.resume, true);
    const summary = getQueuedJobSummary({
      databasePath
    });
    assert.equal(summary.running, 1);
    assert.equal(summary.queued, 0);

    const resumed = createOrResumeState({
      task: "agent",
      resume: Boolean(reclaimed.payload.options.resume),
      cachePath,
      createInitialState: () => ({
        runId: "fresh_run",
        marker: "fresh-state"
      })
    });

    assert.equal(resumed.resumed, true);
    assert.equal(resumed.state.runId, "saved_run");
    assert.equal(resumed.state.marker, "persisted-state");
  } finally {
    queueDb?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("queue recovery only restores truly stale running jobs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-recovery-active-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const staleCachePath = path.join(tempDir, "stale-cache.json");
  const activeCachePath = path.join(tempDir, "active-cache.json");
  let db: DatabaseSync | null = null;

  try {
    const staleQueued = enqueueQueuedAgentJob({
      databasePath,
      payload: {
        taskType: "agent",
        mode: "workflow",
        label: "Stale recovery test",
        options: {
          instruction: "Test stale queue recovery",
          cachePath: staleCachePath,
          reportPath: path.join(tempDir, "stale-report.md"),
          resume: false
        }
      }
    });
    const activeQueued = enqueueQueuedAgentJob({
      databasePath,
      payload: {
        taskType: "agent",
        mode: "workflow",
        label: "Active recovery test",
        options: {
          instruction: "Test active queue recovery",
          cachePath: activeCachePath,
          reportPath: path.join(tempDir, "active-report.md"),
          resume: false
        }
      }
    });

    const staleClaimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-stale",
      leaseTtlSeconds: 60
    });
    const activeClaimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-active",
      leaseTtlSeconds: 60
    });
    assert.ok(staleClaimed);
    assert.ok(activeClaimed);

    db = new DatabaseSync(databasePath);
    db.prepare(`
      UPDATE queued_jobs
      SET lease_expires_at = ?
      WHERE id = ?
    `).run("2000-01-01T00:00:00.000Z", staleQueued.queueId);
    db.prepare(`
      UPDATE queued_jobs
      SET lease_expires_at = ?
      WHERE id = ?
    `).run("2999-01-01T00:00:00.000Z", activeQueued.queueId);

    const recoveredCount = recoverStaleQueuedJobs({
      databasePath
    });
    assert.equal(recoveredCount, 1);

    const staleRow = db.prepare(`
      SELECT status
      FROM queued_jobs
      WHERE id = ?
    `).get(staleQueued.queueId) as Record<string, unknown> | undefined;
    const activeRow = db.prepare(`
      SELECT status
      FROM queued_jobs
      WHERE id = ?
    `).get(activeQueued.queueId) as Record<string, unknown> | undefined;

    assert.equal(staleRow?.status, "queued");
    assert.equal(activeRow?.status, "running");
  } finally {
    db?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
