import type {
  StoredJobArtifactRecord,
  StoredJobStepRecord,
  StoredJobSummary
} from "./job-store";
import type { JobRunEventRecord } from "../types";

interface StoredJobRuntimeSummarySource {
  job: StoredJobSummary;
  steps: StoredJobStepRecord[];
  artifacts: StoredJobArtifactRecord[];
  events: JobRunEventRecord[];
  evidenceGraph: {
    nodes: number;
    edges: number;
    danglingEdges: number;
    orphanNodes: number;
  };
}

export function formatStoredJobRuntimeSummary(detail: StoredJobRuntimeSummarySource): string {
  const workflow = detail.job.workflowName ? ` / ${detail.job.workflowName}` : "";
  const control = detail.job.controlAction ? `, control ${detail.job.controlAction} requested` : "";
  const graphIssueCount = detail.evidenceGraph.danglingEdges + detail.evidenceGraph.orphanNodes;
  const graph = graphIssueCount > 0
    ? `${detail.evidenceGraph.nodes} nodes, ${detail.evidenceGraph.edges} edges, ${graphIssueCount} graph issue${graphIssueCount === 1 ? "" : "s"}`
    : `${detail.evidenceGraph.nodes} nodes, ${detail.evidenceGraph.edges} edges`;

  return [
    `${detail.job.status} ${detail.job.taskType} job${workflow}`,
    `${detail.steps.length} steps`,
    `${detail.artifacts.length} artifacts`,
    `${detail.events.length} events`,
    graph + control
  ].join(" | ");
}
