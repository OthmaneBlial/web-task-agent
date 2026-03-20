import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  requestAgentJobControl,
  rerunAgentJob,
  resumeAgentJob
} from "../lib/job-operations";
import {
  controlQueuedJob,
  enqueueQueuedAgentJob,
  getQueuedJob,
  listQueuedJobs
} from "../lib/job-queue";
import { JobStore, listJobRunEvents } from "../lib/job-store";

function createAgentJobStore(databasePath: string, jobId: string, status: "running" | "paused") {
  return new JobStore({
    databasePath,
    jobId,
    taskType: "agent",
    workflowName: "article-research",
    title: "Job Controls Test",
    instruction: "Research agent control flows",
    status,
    startedAt: "2026-03-20T10:00:00.000Z",
    updatedAt: "2026-03-20T10:00:00.000Z",
    cachePath: path.join(path.dirname(databasePath), `${jobId}.json`),
    reportPath: path.join(path.dirname(databasePath), `${jobId}.md`),
    input: {
      instruction: "Research agent control flows",
      memoryPath: null,
      maxQueries: 4,
      maxResultsPerQuery: 12,
      fetchBatchSize: 5,
      maxRuntimeHours: 6,
      workflowName: "article-research",
      workflowPresetId: "standard",
      workflowTemplateId: "article-research",
      workflowInputs: {
        topic: "job controls",
        audience: null,
        context: null
      },
      jobTitle: "Job Controls Test"
    },
    budget: {
      maxQueries: 4,
      maxResultsPerQuery: 12,
      fetchBatchSize: 5,
      maxRuntimeHours: 6,
      leaseTtlSeconds: 900
    },
    output: {}
  });
}

test("job controls can pause, resume a paused queue, and rerun from stored config", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-job-controls-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const pausedJob = createAgentJobStore(databasePath, "job_pause", "paused");
    pausedJob.appendRunEvent("log", "job paused and ready to resume");

    const pausedQueue = enqueueQueuedAgentJob({
      databasePath,
      jobId: "job_pause",
      payload: {
        taskType: "agent",
        mode: "workflow",
        label: "Paused queue item",
        options: {
          instruction: "Research agent control flows",
          resume: true,
          cachePath: path.join(tempDir, "job_pause.json"),
          reportPath: path.join(tempDir, "job_pause.md")
        }
      }
    });
    controlQueuedJob({
      databasePath,
      queueId: pausedQueue.queueId,
      action: "pause"
    });

    const resumed = resumeAgentJob({
      databasePath,
      jobId: "job_pause"
    });
    assert.equal(resumed.resumedExistingQueue, true);
    const resumedQueue = getQueuedJob({
      databasePath,
      queueId: pausedQueue.queueId
    });
    assert.ok(resumedQueue);
    assert.equal(resumedQueue.status, "queued");
    assert.equal(resumedQueue.payload.options.resume, true);

    const runningJob = createAgentJobStore(databasePath, "job_run", "running");
    runningJob.appendRunEvent("log", "job is running");
    const controlled = requestAgentJobControl({
      databasePath,
      jobId: "job_run",
      action: "pause"
    });
    assert.ok(controlled);
    assert.equal(controlled.controlAction, "pause");

    const rerun = rerunAgentJob({
      databasePath,
      jobId: "job_run"
    });
    const rerunQueue = getQueuedJob({
      databasePath,
      queueId: rerun.queueId
    });
    assert.ok(rerunQueue);
    assert.equal(rerunQueue.status, "queued");
    assert.equal(rerunQueue.payload.options.resume, false);
    assert.equal(rerunQueue.jobId, null);
    assert.equal(
      rerunQueue.payload.options.cachePath,
      path.join(tempDir, "job_run.json")
    );
    assert.equal(
      rerunQueue.payload.options.reportPath,
      path.join(tempDir, "job_run.md")
    );

    const events = listJobRunEvents({
      databasePath,
      jobId: "job_run",
      limit: 20
    });
    assert.ok(events.some((event) => event.eventType === "control_requested"));

    const linkedPausedQueues = listQueuedJobs({
      databasePath,
      jobId: "job_pause",
      limit: 10
    });
    assert.equal(linkedPausedQueues.length, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
