import type { QueuedJobRecord } from "./job-queue";
import type { StoredJobDetail } from "./job-store";

function formatObjectPreview(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

export function formatStoredJobDebugLines(detail: StoredJobDetail): string[] {
  const recentEvents = detail.events.slice(-5);
  const artifactLines = detail.artifacts.slice(0, 10).map((artifact) => `- ${artifact.artifactKey}: ${artifact.path}`);

  return [
    `Job ID: ${detail.job.jobId}`,
    `Title: ${detail.job.title}`,
    `Status: ${detail.job.status}`,
    `Runtime Summary: ${detail.runtimeSummary}`,
    `Report: ${detail.job.reportPath ?? "-"}`,
    `Artifact Dir: ${detail.job.artifactDir ?? "-"}`,
    `Steps: ${detail.steps.length}`,
    `Artifacts: ${detail.artifacts.length}`,
    `Evidence Graph: ${detail.evidenceGraph.nodes} nodes, ${detail.evidenceGraph.edges} edges, ${detail.evidenceGraph.danglingEdges} dangling, ${detail.evidenceGraph.orphanNodes} orphaned`,
    recentEvents.length > 0 ? "Recent Events:" : "Recent Events: -",
    ...recentEvents.map((event) => `- ${event.createdAt} [${event.eventType}] ${event.message}`),
    artifactLines.length > 0 ? "Artifact Paths:" : "Artifact Paths: -",
    ...artifactLines
  ];
}

export function formatQueuedJobDebugLines(job: QueuedJobRecord): string[] {
  const optionEntries = Object.entries(job.payload.options ?? {})
    .slice(0, 10)
    .map(([key, value]) => `- ${key}: ${formatObjectPreview(value)}`);

  return [
    `Queue ID: ${job.queueId}`,
    `Status: ${job.status}`,
    `Mode: ${job.mode}`,
    `Task Type: ${job.taskType}`,
    `Label: ${job.label}`,
    `Attempts: ${job.attempts}/${job.maxAttempts}`,
    `Priority: ${job.priority}`,
    `Run After: ${job.runAfter}`,
    `Lease Expires: ${job.leaseExpiresAt ?? "-"}`,
    `Job ID: ${job.jobId ?? "-"}`,
    `Control: ${job.controlAction ?? "-"}`,
    `Last Error: ${job.lastError ?? "-"}`,
    "Payload Options:",
    ...(optionEntries.length > 0 ? optionEntries : ["- none"])
  ];
}
