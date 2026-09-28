import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { createOrResumeState, saveTaskState } from "../lib/cache";
import {
  claimNextQueuedJob,
  completeQueuedJob,
  controlQueuedJob,
  enqueueQueuedAgentJob,
  failQueuedJob,
  getQueuedJob,
  getQueuedJobSummary,
  heartbeatQueuedJob,
  listQueuedJobs,
  ownsQueuedJobLease,
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
    assert.equal(ownsQueuedJobLease({ databasePath, queueId: queued.queueId, workerId: "worker-a" }), true);

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
    assert.equal(ownsQueuedJobLease({ databasePath, queueId: queued.queueId, workerId: "worker-a" }), false);
    assert.equal(ownsQueuedJobLease({ databasePath, queueId: queued.queueId, workerId: "worker-b" }), true);
    assert.throws(
      () => heartbeatQueuedJob({
        databasePath,
        queueId: queued.queueId,
        workerId: "worker-a",
        leaseTtlSeconds: 60
      }),
      /no longer owned by worker-a/
    );
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

test("stale queue recovery preserves a pending pause for the replacement worker", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-pending-pause-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  let db: DatabaseSync | null = null;

  try {
    const queued = enqueueQueuedAgentJob({
      databasePath,
      payload: {
        taskType: "agent",
        mode: "agent",
        label: "Pending pause recovery test",
        options: { instruction: "Preserve the pause request", resume: false }
      }
    });
    assert.ok(claimNextQueuedJob({
      databasePath,
      workerId: "worker-before-recovery",
      leaseTtlSeconds: 60
    }));
    assert.equal(
      controlQueuedJob({ databasePath, queueId: queued.queueId, action: "pause" })?.controlAction,
      "pause"
    );

    db = new DatabaseSync(databasePath);
    db.prepare("UPDATE queued_jobs SET lease_expires_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", queued.queueId);
    assert.equal(recoverStaleQueuedJobs({ databasePath }), 1);
    assert.equal(getQueuedJob({ databasePath, queueId: queued.queueId })?.status, "queued");
    assert.equal(getQueuedJob({ databasePath, queueId: queued.queueId })?.controlAction, "pause");

    const reclaimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-after-recovery",
      leaseTtlSeconds: 60
    });
    assert.equal(reclaimed?.controlAction, "pause");
  } finally {
    db?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("queue listing and claiming use a stable ID tie-breaker", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-order-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  let db: DatabaseSync | null = null;

  try {
    const queueIds = ["first", "second"].map((label) => enqueueQueuedAgentJob({
      databasePath,
      payload: {
        taskType: "agent",
        mode: "agent",
        label,
        options: { instruction: "Test stable queue ordering", resume: false }
      }
    }).queueId).sort();
    db = new DatabaseSync(databasePath);
    db.prepare("UPDATE queued_jobs SET created_at = ?, run_after = ?")
      .run("2000-01-01T00:00:00.000Z", "2000-01-01T00:00:00.000Z");

    assert.deepEqual(
      listQueuedJobs({ databasePath }).map((job) => job.queueId),
      queueIds
    );
    assert.equal(
      claimNextQueuedJob({ databasePath, workerId: "worker-order", leaseTtlSeconds: 60 })?.queueId,
      queueIds[0]
    );
  } finally {
    db?.close();
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

test("stale queue recovery does not exceed the attempt limit", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-recovery-limit-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  let db: DatabaseSync | null = null;

  try {
    const queued = enqueueQueuedAgentJob({
      databasePath,
      maxAttempts: 1,
      payload: {
        taskType: "agent",
        mode: "agent",
        label: "Attempt limit recovery test",
        options: { instruction: "must not run twice", resume: false }
      }
    });
    assert.ok(claimNextQueuedJob({
      databasePath,
      workerId: "worker-final-attempt",
      leaseTtlSeconds: 60
    }));

    db = new DatabaseSync(databasePath);
    const originalPayload = db.prepare(`
      SELECT payload_json
      FROM queued_jobs
      WHERE id = ?
    `).get(queued.queueId) as Record<string, unknown> | undefined;
    db.prepare(`
      UPDATE queued_jobs
      SET lease_expires_at = ?
      WHERE id = ?
    `).run("2000-01-01T00:00:00.000Z", queued.queueId);

    assert.equal(recoverStaleQueuedJobs({ databasePath }), 0);

    const row = db.prepare(`
      SELECT status, attempts, max_attempts, payload_json, last_error, completed_at
      FROM queued_jobs
      WHERE id = ?
    `).get(queued.queueId) as Record<string, unknown> | undefined;
    assert.equal(row?.status, "failed");
    assert.equal(row?.attempts, 1);
    assert.equal(row?.max_attempts, 1);
    assert.equal(row?.payload_json, originalPayload?.payload_json);
    assert.match(String(row?.last_error), /attempt/i);
    assert.ok(row?.completed_at);
  } finally {
    db?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("queue recovery fails malformed payloads without overwriting them", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-recovery-invalid-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  let db: DatabaseSync | null = null;

  try {
    const queued = ["Valid recovery", "Malformed recovery"].map((label) =>
      enqueueQueuedAgentJob({
        databasePath,
        payload: {
          taskType: "agent",
          mode: "agent",
          label,
          options: {
            instruction: label,
            resume: false
          }
        }
      })
    );
    const claimed = [0, 1].map((index) =>
      claimNextQueuedJob({
        databasePath,
        workerId: `worker-${index}`,
        leaseTtlSeconds: 60
      })
    );
    assert.ok(claimed[0]);
    assert.ok(claimed[1]);

    const malformedJob = claimed.find((job) => job?.payload.label === "Malformed recovery");
    const validJob = claimed.find((job) => job?.payload.label === "Valid recovery");
    assert.ok(malformedJob);
    assert.ok(validJob);

    db = new DatabaseSync(databasePath);
    db.prepare(`
      UPDATE queued_jobs
      SET payload_json = '{not json', lease_expires_at = ?
      WHERE id = ?
    `).run("2000-01-01T00:00:00.000Z", malformedJob.queueId);
    db.prepare(`
      UPDATE queued_jobs
      SET lease_expires_at = ?
      WHERE id = ?
    `).run("2000-01-01T00:00:00.000Z", validJob.queueId);

    assert.equal(recoverStaleQueuedJobs({ databasePath }), 1);

    const malformedRow = db.prepare(`
      SELECT status, payload_json, last_error, lease_expires_at, completed_at
      FROM queued_jobs
      WHERE id = ?
    `).get(malformedJob.queueId) as Record<string, unknown> | undefined;
    assert.equal(malformedRow?.status, "failed");
    assert.equal(malformedRow?.payload_json, "{not json");
    assert.match(String(malformedRow?.last_error), /payload/i);
    assert.equal(malformedRow?.lease_expires_at, null);
    assert.ok(malformedRow?.completed_at);
    assert.equal(
      controlQueuedJob({ databasePath, queueId: malformedJob.queueId, action: "retry" })?.status,
      "failed"
    );
    const payloadAfterRetry = db.prepare(`
      SELECT payload_json
      FROM queued_jobs
      WHERE id = ?
    `).get(malformedJob.queueId) as Record<string, unknown> | undefined;
    assert.equal(payloadAfterRetry?.payload_json, "{not json");

    const validRow = db.prepare(`
      SELECT status
      FROM queued_jobs
      WHERE id = ?
    `).get(validJob.queueId) as Record<string, unknown> | undefined;
    assert.equal(validRow?.status, "queued");
    const reclaimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-recovered",
      leaseTtlSeconds: 60
    });
    assert.equal(reclaimed?.queueId, validJob.queueId);
  } finally {
    db?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("worker skips and preserves queued jobs with malformed payloads", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-claim-invalid-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  let db: DatabaseSync | null = null;

  try {
    const malformed = enqueueQueuedAgentJob({
      databasePath,
      priority: 1,
      payload: {
        taskType: "agent",
        mode: "agent",
        label: "Malformed queued job",
        options: { instruction: "must not run", resume: false }
      }
    });
    const valid = enqueueQueuedAgentJob({
      databasePath,
      priority: 2,
      payload: {
        taskType: "agent",
        mode: "agent",
        label: "Valid queued job",
        options: { instruction: "run this", resume: false }
      }
    });

    db = new DatabaseSync(databasePath);
    db.prepare(`
      UPDATE queued_jobs
      SET payload_json = '{not json'
      WHERE id = ?
    `).run(malformed.queueId);

    const claimed = claimNextQueuedJob({
      databasePath,
      workerId: "worker-valid",
      leaseTtlSeconds: 60
    });
    assert.equal(claimed?.queueId, valid.queueId);
    assert.equal(claimed?.payload.options.instruction, "run this");

    const malformedRow = db.prepare(`
      SELECT status, payload_json, last_error
      FROM queued_jobs
      WHERE id = ?
    `).get(malformed.queueId) as Record<string, unknown> | undefined;
    assert.equal(malformedRow?.status, "failed");
    assert.equal(malformedRow?.payload_json, "{not json");
    assert.match(String(malformedRow?.last_error), /preserved/i);
  } finally {
    db?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("successful manual retries clear the previous queue error", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-retry-success-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  let db: DatabaseSync | null = null;

  try {
    const queued = enqueueQueuedAgentJob({
      databasePath,
      maxAttempts: 1,
      payload: {
        taskType: "agent",
        mode: "agent",
        label: "Retry success test",
        options: { instruction: "succeed on retry", resume: false }
      }
    });
    assert.ok(claimNextQueuedJob({ databasePath, workerId: "worker-first", leaseTtlSeconds: 60 }));
    failQueuedJob({
      databasePath,
      queueId: queued.queueId,
      workerId: "worker-first",
      errorMessage: "first attempt failed with password=plain-password"
    });
    assert.equal(
      controlQueuedJob({ databasePath, queueId: queued.queueId, action: "retry" })?.lastError,
      "first attempt failed with password=[REDACTED]"
    );

    db = new DatabaseSync(databasePath);
    db.prepare("UPDATE queued_jobs SET run_after = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", queued.queueId);
    assert.ok(claimNextQueuedJob({ databasePath, workerId: "worker-retry", leaseTtlSeconds: 60 }));
    completeQueuedJob({
      databasePath,
      queueId: queued.queueId,
      workerId: "worker-retry",
      result: { status: "completed" }
    });

    const row = db.prepare("SELECT status, last_error FROM queued_jobs WHERE id = ?")
      .get(queued.queueId) as Record<string, unknown> | undefined;
    assert.equal(row?.status, "completed");
    assert.equal(row?.last_error, null);
  } finally {
    db?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("queue summary closes its SQLite connection after every call", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-queue-close-"));
  const databaseDir = path.join(tempDir, "private");
  const databasePath = path.join(databaseDir, "jobs.sqlite");
  const originalClose = DatabaseSync.prototype.close;
  let closeCount = 0;
  DatabaseSync.prototype.close = function trackClose() {
    closeCount += 1;
    originalClose.call(this);
  };

  try {
    for (let index = 0; index < 20; index += 1) {
      getQueuedJobSummary({ databasePath });
    }
    assert.equal(closeCount, 20);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(databaseDir).mode & 0o777, 0o700);
      assert.equal(fs.statSync(databasePath).mode & 0o777, 0o600);
    }
  } finally {
    DatabaseSync.prototype.close = originalClose;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
