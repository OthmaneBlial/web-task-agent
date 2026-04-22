import type { JobRunEventRecord } from "../types";
import type { StoredJobDetail } from "./job-store";

function formatEventPreview(event: JobRunEventRecord): string {
  return `${event.createdAt} [${event.eventType}] ${event.message}`;
}

function buildRecommendation(
  detail: StoredJobDetail,
  recoverableJobIds: Set<string>
): {
  label: string;
  command: string;
  reason: string;
} {
  const jobId = detail.job.jobId;
  const isRecoverable = detail.job.status === "paused" || recoverableJobIds.has(jobId);

  if (detail.job.status === "paused") {
    return {
      label: "resume",
      command: `web-task-agent job resume ${jobId}`,
      reason: detail.job.controlAction === "pause"
        ? "The run is paused and waiting for a resume request."
        : "The run is paused and can continue from the stored checkpoint."
    };
  }

  if (detail.job.status === "running" || detail.job.status === "planning" || detail.job.status === "waiting_review") {
    if (isRecoverable) {
      return {
        label: "resume",
        command: `web-task-agent job resume ${jobId}`,
        reason: "The job lease has expired and the stored state is recoverable."
      };
    }

    return {
      label: "inspect",
      command: `web-task-agent job inspect ${jobId}`,
      reason: "The job is still active, so inspect its latest state before taking action."
    };
  }

  if (detail.job.status === "failed" || detail.job.status === "cancelled") {
    return {
      label: "rerun",
      command: `web-task-agent job rerun ${jobId}`,
      reason: "The stored run ended, so a fresh rerun is usually the safest next step."
    };
  }

  return {
    label: "inspect",
    command: `web-task-agent job inspect ${jobId}`,
    reason: "The stored job already reached a terminal or reviewable state."
  };
}

export function formatStoredJobRecoveryReportLines(
  detail: StoredJobDetail,
  recoverableJobIds: Set<string> = new Set()
): string[] {
  const recentEvents = detail.events.slice(-3);
  const recommendation = buildRecommendation(detail, recoverableJobIds);

  return [
    `Recovery Report: ${detail.job.jobId}`,
    `Title: ${detail.job.title}`,
    `Status: ${detail.job.status}`,
    `Task Type: ${detail.job.taskType}`,
    `Workflow: ${detail.job.workflowName ?? "-"}`,
    `Control: ${detail.job.controlAction ?? "-"}`,
    `Runtime Summary: ${detail.runtimeSummary}`,
    `Recoverable: ${detail.job.status === "paused" || recoverableJobIds.has(detail.job.jobId) ? "yes" : "no"}`,
    `Recommended Next Command: ${recommendation.command}`,
    `Reason: ${recommendation.reason}`,
    recentEvents.length > 0 ? "Recent Events:" : "Recent Events: -",
    ...recentEvents.map((event) => `- ${formatEventPreview(event)}`),
    detail.job.errorMessage ? `Error: ${detail.job.errorMessage}` : "Error: -"
  ];
}
