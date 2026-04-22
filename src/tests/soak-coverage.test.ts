import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  claimNextQueuedJob,
  enqueueQueuedAgentJob,
  recoverStaleQueuedJobs
} from "../lib/job-queue";

test("queue recovery soak keeps recovering stale jobs across repeated cycles", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-soak-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");
  const db = new DatabaseSync(databasePath);

  try {
    let recoveredCount = 0;

    for (let index = 0; index < 12; index += 1) {
      const queued = enqueueQueuedAgentJob({
        databasePath,
        payload: {
          taskType: "agent",
          mode: "workflow",
          label: `Soak job ${index + 1}`,
          options: {
            instruction: `Recover soak job ${index + 1}`,
            reportPath: path.join(tempDir, `report-${index + 1}.md`),
            resume: false
          }
        }
      });

      const claimed = claimNextQueuedJob({
        databasePath,
        workerId: `worker-${index + 1}`,
        leaseTtlSeconds: 60
      });
      assert.ok(claimed);

      db.prepare(`
        UPDATE queued_jobs
        SET lease_expires_at = ?
        WHERE id = ?
      `).run("2000-01-01T00:00:00.000Z", queued.queueId);

      recoveredCount += recoverStaleQueuedJobs({
        databasePath
      });

      const reclaimed = claimNextQueuedJob({
        databasePath,
        workerId: `worker-recovered-${index + 1}`,
        leaseTtlSeconds: 60
      });
      assert.ok(reclaimed);
      assert.equal(reclaimed.payload.options.resume, true);
    }

    assert.equal(recoveredCount, 12);
  } finally {
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
