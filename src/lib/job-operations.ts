import {
  controlQueuedJob,
  enqueueQueuedAgentJob,
  listQueuedJobs
} from "./job-queue";
import {
  getStoredJobDetail,
  requestStoredJobControl,
  resolveJobDatabasePath,
  type StoredJobSummary
} from "./job-store";
import type { AgentRunOptions, JobControlAction } from "../types";

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function recordOfStringsOrNull(
  value: unknown
): Record<string, string | null> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const output: Record<string, string | null> = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = entry === null ? null : stringOrNull(entry);
  }
  return output;
}

export function buildAgentRunOptionsFromStoredJob(
  job: StoredJobSummary,
  mode: "resume" | "rerun"
): AgentRunOptions {
  if (job.taskType !== "agent") {
    throw new Error(`job ${job.jobId} is not an agent job`);
  }

  const input = job.input ?? {};
  const budget = job.budget ?? {};
  const instruction = stringOrNull(input.instruction) ?? job.instruction;
  if (!instruction) {
    throw new Error(`job ${job.jobId} has no stored instruction`);
  }

  const workflowInputs = recordOfStringsOrNull(input.workflowInputs);
  const preserveWorkflowPaths = Boolean(job.workflowName) && mode === "rerun";

  return {
    instruction,
    resume: mode === "resume",
    cachePath:
      mode === "resume" || preserveWorkflowPaths ? job.cachePath ?? undefined : undefined,
    reportPath:
      mode === "resume" || preserveWorkflowPaths ? job.reportPath ?? undefined : undefined,
    memoryPath: stringOrNull(input.memoryPath) ?? undefined,
    maxQueries:
      numberOrNull(input.maxQueries) ??
      numberOrNull(budget.maxQueries) ??
      undefined,
    maxResultsPerQuery:
      numberOrNull(input.maxResultsPerQuery) ??
      numberOrNull(budget.maxResultsPerQuery) ??
      undefined,
    fetchBatchSize:
      numberOrNull(input.fetchBatchSize) ??
      numberOrNull(budget.fetchBatchSize) ??
      undefined,
    maxRuntimeHours:
      numberOrNull(input.maxRuntimeHours) ??
      numberOrNull(budget.maxRuntimeHours) ??
      undefined,
    leaseTtlMinutes:
      typeof budget.leaseTtlSeconds === "number" && Number.isFinite(budget.leaseTtlSeconds)
        ? Math.max(1, Math.round(Number(budget.leaseTtlSeconds) / 60))
        : undefined,
    workflowName: stringOrNull(input.workflowName) ?? job.workflowName ?? undefined,
    workflowPresetId: stringOrNull(input.workflowPresetId),
    workflowTemplateId: stringOrNull(input.workflowTemplateId),
    workflowInputs,
    jobTitle: stringOrNull(input.jobTitle) ?? job.title
  };
}

export function requestAgentJobControl(input: {
  databasePath?: string;
  jobId: string;
  action: JobControlAction;
}) {
  const detail = getStoredJobDetail({
    databasePath: input.databasePath,
    jobId: input.jobId
  });
  if (!detail) {
    return null;
  }
  if (detail.job.taskType !== "agent") {
    throw new Error(`job ${input.jobId} is not an agent job`);
  }
  return requestStoredJobControl(input);
}

export function resumeAgentJob(input: {
  databasePath?: string;
  jobId: string;
}): {
  queueId: string;
  databasePath: string;
  resumedExistingQueue: boolean;
} {
  const detail = getStoredJobDetail({
    databasePath: input.databasePath,
    jobId: input.jobId
  });
  if (!detail) {
    throw new Error(`unknown job: ${input.jobId}`);
  }

  const pausedQueue = listQueuedJobs({
    databasePath: input.databasePath,
    jobId: input.jobId,
    status: "paused",
    limit: 1
  })[0];

  if (pausedQueue) {
    const resumed = controlQueuedJob({
      databasePath: input.databasePath,
      queueId: pausedQueue.queueId,
      action: "resume"
    });
    if (!resumed) {
      throw new Error(`failed to resume queued job for ${input.jobId}`);
    }
    return {
      queueId: resumed.queueId,
      databasePath: resolveJobDatabasePath(input.databasePath),
      resumedExistingQueue: true
    };
  }

  const options = buildAgentRunOptionsFromStoredJob(detail.job, "resume");
  const queued = enqueueQueuedAgentJob({
    databasePath: input.databasePath,
    jobId: input.jobId,
    payload: {
      taskType: "agent",
      mode: detail.job.workflowName ? "workflow" : "agent",
      label: detail.job.title,
      options
    }
  });

  return {
    queueId: queued.queueId,
    databasePath: queued.databasePath,
    resumedExistingQueue: false
  };
}

export function rerunAgentJob(input: {
  databasePath?: string;
  jobId: string;
}): {
  queueId: string;
  databasePath: string;
} {
  const detail = getStoredJobDetail({
    databasePath: input.databasePath,
    jobId: input.jobId
  });
  if (!detail) {
    throw new Error(`unknown job: ${input.jobId}`);
  }

  const options = buildAgentRunOptionsFromStoredJob(detail.job, "rerun");
  const queued = enqueueQueuedAgentJob({
    databasePath: input.databasePath,
    payload: {
      taskType: "agent",
      mode: detail.job.workflowName ? "workflow" : "agent",
      label: detail.job.title,
      options
    }
  });

  return {
    queueId: queued.queueId,
    databasePath: queued.databasePath
  };
}
