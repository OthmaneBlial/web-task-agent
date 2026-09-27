import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { closeSharedJobDatabase, JobStore } from "../lib/job-store";

function createJobStore(databasePath: string, jobId: string): JobStore {
  return new JobStore({
    databasePath,
    jobId,
    taskType: "agent",
    workflowName: "lease-test",
    title: "Lease ownership test",
    instruction: "Test execution lease ownership",
    status: "running",
    startedAt: "2026-09-28T10:00:00.000Z",
    input: {},
    budget: {},
    output: {}
  });
}

test("a stale JobStore cannot heartbeat or release a replacement owner's lease", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-job-lease-owner-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const jobId = "job_lease_owner";
  let db: DatabaseSync | null = null;

  try {
    const staleStore = createJobStore(databasePath, jobId);
    staleStore.acquireLease({ ownerId: "worker-old", ttlSeconds: 60 });

    db = new DatabaseSync(databasePath);
    db.prepare("UPDATE jobs SET lease_expires_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", jobId);

    const currentStore = createJobStore(databasePath, jobId);
    currentStore.acquireLease({ ownerId: "worker-new", ttlSeconds: 60 });
    const replacementLease = currentStore.getExecutionLease();
    assert.equal(replacementLease?.ownerId, "worker-new");

    assert.throws(() => staleStore.heartbeat(), /failed to refresh execution lease/);
    staleStore.releaseLease();

    assert.deepEqual(currentStore.getExecutionLease(), replacementLease);
  } finally {
    db?.close();
    closeSharedJobDatabase(databasePath);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
