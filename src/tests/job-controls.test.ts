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

function createAgentJobStore(
  databasePath: string,
  jobId: string,
  status: "running" | "paused",
  workflowInputs: Record<string, string | null> = {
    topic: "job controls",
    audience: null,
    context: null
  }
) {
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
      researchDurationMinutes: 30,
      maxRuntimeHours: 6,
      workflowName: "article-research",
      workflowPresetId: "standard",
      workflowTemplateId: "article-research",
      workflowInputs,
      jobTitle: "Job Controls Test"
    },
    budget: {
      maxQueries: 4,
      maxResultsPerQuery: 12,
      fetchBatchSize: 5,
      researchDurationMinutes: 30,
      maxRuntimeHours: 6,
      leaseTtlSeconds: 900
    },
    output: {}
  });
}

test("job logs accept repeated identical events within the same millisecond", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-job-repeated-log-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const job = createAgentJobStore(databasePath, "job_repeated_logs", "paused");
    for (let index = 0; index < 100; index += 1) {
      job.appendRunEvent("log", "same event");
    }
    const repeatedEvents = listJobRunEvents({ databasePath, jobId: "job_repeated_logs", limit: 1_000 })
      .filter((event) => event.message === "same event");
    assert.equal(repeatedEvents.length, 100);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("job log listing returns the newest events in chronological order", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-job-recent-logs-"));
  const databasePath = path.join(tempDir, "jobs.sqlite");

  try {
    const job = createAgentJobStore(databasePath, "job_recent_logs", "paused");
    for (let index = 0; index < 10; index += 1) {
      job.appendRunEvent("log", `event-${index}`);
    }

    const events = listJobRunEvents({ databasePath, jobId: "job_recent_logs", limit: 3 });
    assert.deepEqual(events.map((event) => event.message), ["event-7", "event-8", "event-9"]);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("job rerun preserves prototype-named workflow inputs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-task-agent-job-prototype-input-"));
  try {
    const databasePath = path.join(tempDir, "jobs.sqlite");
    const workflowInputs = JSON.parse('{"__proto__":"preserved"}') as Record<string, string | null>;
    createAgentJobStore(databasePath, "job_proto", "running", workflowInputs);

    const rerun = rerunAgentJob({ databasePath, jobId: "job_proto" });
    const queue = getQueuedJob({ databasePath, queueId: rerun.queueId });
    assert.ok(queue);
    assert.ok(queue.payload.options.workflowInputs);
    assert.equal(Object.hasOwn(queue.payload.options.workflowInputs, "__proto__"), true);
    assert.equal(queue.payload.options.workflowInputs.__proto__, "preserved");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

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
    assert.equal(rerunQueue.payload.options.researchDurationMinutes, 30);

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
