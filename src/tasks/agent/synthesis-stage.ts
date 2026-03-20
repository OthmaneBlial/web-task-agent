import fs from "node:fs";
import path from "node:path";

import { JobStore } from "../../lib/job-store";
import { LlmService } from "../../lib/llm";
import type {
  AgentEvidenceBundle,
  AgentResearchSummary,
  AgentRunState
} from "../../types";
import { nowIso } from "./shared";

function readIfExists(filePath: string | null): string | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function renderEvidenceSection(evidence: AgentEvidenceBundle): string {
  const lines = [
    "## Evidence Snapshot",
    "",
    `Queries: ${evidence.counts.queries}`,
    `Sources: ${evidence.counts.sources}`,
    `Documents: ${evidence.counts.documents}`,
    `Extractions: ${evidence.counts.extractions}`,
    `Clusters: ${evidence.counts.clusters}`,
    `Contradictions: ${evidence.counts.contradictions}`,
    ""
  ];

  if (evidence.highlights.themes.length > 0) {
    lines.push("### Themes", "");
    for (const item of evidence.highlights.themes.slice(0, 6)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (evidence.highlights.complaints.length > 0) {
    lines.push("### Complaints", "");
    for (const item of evidence.highlights.complaints.slice(0, 6)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (evidence.highlights.featureRequests.length > 0) {
    lines.push("### Feature Requests", "");
    for (const item of evidence.highlights.featureRequests.slice(0, 6)) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (evidence.clusters.length > 0) {
    lines.push("### Trending Signals", "");
    for (const cluster of evidence.clusters.slice(0, 5)) {
      lines.push(`- ${cluster.label} (${(cluster.trendScore * 100).toFixed(0)}% trend)`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function renderClusterSection(evidence: AgentEvidenceBundle): string {
  if (evidence.clusters.length === 0) {
    return "";
  }

  const lines = ["## Repeated Evidence Clusters", ""];

  for (const cluster of evidence.clusters.slice(0, 12)) {
    const supportMeta =
      `${cluster.kind} | ${cluster.sourceCount} sources | ${cluster.evidenceCount} evidence items | confidence ${(cluster.averageConfidence * 100).toFixed(0)}% | trend ${(cluster.trendScore * 100).toFixed(0)}% | score ${(cluster.overallScore * 100).toFixed(0)}%`;
    lines.push(`- [${cluster.id}] ${cluster.label}`);
    lines.push(`  Support: ${supportMeta}`);
    if (cluster.supportingValues.length > 0) {
      lines.push(`  Variants: ${cluster.supportingValues.slice(0, 3).join(" | ")}`);
    }
    if (cluster.evidenceIds.length > 0) {
      lines.push(`  Evidence IDs: ${cluster.evidenceIds.slice(0, 4).join(", ")}`);
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderContradictionSection(evidence: AgentEvidenceBundle): string {
  if (evidence.contradictions.length === 0) {
    return "";
  }

  const lines = ["## Contradictory Evidence", ""];

  for (const contradiction of evidence.contradictions.slice(0, 10)) {
    lines.push(`- [${contradiction.id}] ${contradiction.topic}`);
    lines.push(`  Left: [${contradiction.leftClusterId}] ${contradiction.leftLabel}`);
    lines.push(`  Right: [${contradiction.rightClusterId}] ${contradiction.rightLabel}`);
    lines.push(
      `  Conflict: ${contradiction.leftKind} vs ${contradiction.rightKind} | score ${(contradiction.contradictionScore * 100).toFixed(0)}%`
    );
    lines.push(`  Reason: ${contradiction.reason}`);
    if (contradiction.queries.length > 0) {
      lines.push(`  Queries: ${contradiction.queries.slice(0, 3).join(" | ")}`);
    }
    if (contradiction.evidenceIds.length > 0) {
      lines.push(`  Evidence IDs: ${contradiction.evidenceIds.slice(0, 6).join(", ")}`);
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderSummaryReferenceCatalog(summary: AgentResearchSummary): string {
  const referencedEvidence = summary.referencedEvidence ?? [];
  if (referencedEvidence.length === 0) {
    return "";
  }

  const lines = ["### Evidence References", ""];

  for (const reference of referencedEvidence) {
    const confidence =
      typeof reference.confidence === "number" ? ` | confidence ${(reference.confidence * 100).toFixed(0)}%` : "";
    const score =
      typeof reference.overallScore === "number" ? ` | score ${(reference.overallScore * 100).toFixed(0)}%` : "";
    lines.push(
      `- [${reference.id}] ${reference.kind} | ${reference.sourceTitle} | ${reference.value}${confidence}${score}`
    );
    lines.push(`  Query: ${reference.query} | URL: ${reference.sourceUrl}`);
  }

  lines.push("");
  return lines.join("\n").trim();
}

export function renderResearchSummary(summary: AgentResearchSummary, evidence?: AgentEvidenceBundle | null): string {
  const lines = [
    "## Research Summary",
    "",
    summary.executiveSummary,
    ""
  ];

  const keyFindingDetails =
    (summary.keyFindingDetails ?? []).length > 0
      ? (summary.keyFindingDetails ?? [])
      : summary.keyFindings.map((text) => ({ text, evidenceIds: [] }));
  const contentAngleDetails =
    (summary.contentAngleDetails ?? []).length > 0
      ? (summary.contentAngleDetails ?? [])
      : summary.contentAngles.map((text) => ({ text, evidenceIds: [] }));

  if (keyFindingDetails.length > 0) {
    lines.push("### Key Findings", "");
    for (const finding of keyFindingDetails) {
      lines.push(`- ${finding.text}`);
      if (finding.evidenceIds.length > 0) {
        lines.push(`  Evidence: ${finding.evidenceIds.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (contentAngleDetails.length > 0) {
    lines.push("### Content Angles", "");
    for (const angle of contentAngleDetails) {
      lines.push(`- ${angle.text}`);
      if (angle.evidenceIds.length > 0) {
        lines.push(`  Evidence: ${angle.evidenceIds.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (evidence && evidence.counts.sources > 0) {
    lines.push(renderEvidenceSection(evidence), "");
  }

  const referenceCatalog = renderSummaryReferenceCatalog(summary);
  if (referenceCatalog) {
    lines.push(referenceCatalog, "");
  }

  return lines.join("\n").trim();
}

export function renderReport(state: AgentRunState, evidence?: AgentEvidenceBundle | null): string {
  const postDraft = readIfExists(state.outputs.postDraftPath);
  const commentsDraft = readIfExists(state.outputs.commentsDraftPath);
  const planLines =
    state.plan?.steps.map((step, index) => `${index + 1}. ${step.title} [${step.kind}] - ${step.status}`) ?? [];

  const lines: string[] = [
    "# Agent Job Report",
    "",
    `Generated: ${nowIso()}`,
    `Run ID: ${state.runId}`,
    `Status: ${state.status}`,
    `Instruction: ${state.input.instruction}`,
    `Artifact Directory: ${state.artifactDir}`,
    `Estimated Time: ${state.plan?.estimatedMinutes ?? "unknown"} minutes`,
    "Browsing Policy: 10-20 seconds on readable pages, quick skip on thin/error pages",
    `Memory File: ${state.input.memoryPath ?? "none"}`,
    ""
  ];

  if (state.plan) {
    lines.push("## Plan", "", `Summary: ${state.plan.summary}`, `Tone: ${state.plan.tone}`, "");
    if (state.plan.deliverables.length > 0) {
      lines.push("### Deliverables", "");
      for (const item of state.plan.deliverables) {
        lines.push(`- ${item}`);
      }
      lines.push("");
    }
    if (state.plan.researchQueries.length > 0) {
      lines.push("### Research Queries", "");
      for (const query of state.plan.researchQueries) {
        lines.push(`- ${query}`);
      }
      lines.push("");
    }
    if (planLines.length > 0) {
      lines.push("### Workflow", "", ...planLines, "");
    }
  }

  if (state.researchSummary) {
    lines.push(renderResearchSummary(state.researchSummary, evidence), "");
  } else if (evidence && evidence.counts.sources > 0) {
    lines.push(renderEvidenceSection(evidence), "");
  }

  if (state.research.length > 0) {
    lines.push("## Sources Reviewed", "");
    for (const entry of state.research) {
      lines.push(`### Query: ${entry.query}`, "");
      if (entry.error) {
        lines.push(`Error: ${entry.error}`, "");
        continue;
      }

      if (entry.results.length === 0) {
        lines.push("No search results were captured.", "");
        continue;
      }

      for (const result of entry.results) {
        lines.push(`- [${result.title}](${result.url})`);
        lines.push(`  Site: ${result.site}`);
        if (result.reviewStatus) {
          const reviewMeta =
            result.reviewStatus === "read"
              ? `read for ${result.dwellSeconds ?? 0}s`
              : `skipped${result.skipReason ? ` (${result.skipReason})` : ""}`;
          lines.push(`  Review: ${reviewMeta}`);
        }
        if (result.snippet) {
          lines.push(`  Snippet: ${result.snippet}`);
        }
        if (result.page) {
          const pageHighlights = result.page.headings.slice(0, 3).join(" | ");
          const paragraph = result.page.paragraphs[0] ?? "";
          lines.push(`  Page Notes: ${result.page.description || result.page.h1 || "No meta description found."}`);
          if (pageHighlights) {
            lines.push(`  Headings: ${pageHighlights}`);
          }
          if (paragraph) {
            lines.push(`  Paragraph: ${paragraph}`);
          }
        }
      }
      lines.push("");
    }
  }

  if (evidence && evidence.sources.length > 0) {
    lines.push("## Evidence-Backed Signals", "");

    for (const source of evidence.sources.slice(0, 8)) {
      lines.push(`- [${source.title}](${source.url})`);
      lines.push(`  Query: ${source.query}`);
      lines.push(
        `  Site: ${source.site || "unknown"} | type ${source.contentType} | quality ${(source.sourceQualityScore * 100).toFixed(0)}% | freshness ${(source.freshnessScore * 100).toFixed(0)}% | trend ${(source.trendScore * 100).toFixed(0)}% | score ${(source.overallScore * 100).toFixed(0)}%`
      );
      if (source.reviewStatus) {
        const reviewMeta =
          source.reviewStatus === "read"
            ? `read for ${source.dwellSeconds ?? 0}s`
            : `skipped${source.skipReason ? ` (${source.skipReason})` : ""}`;
        lines.push(`  Review: ${reviewMeta}`);
      }
      if (source.qualitySignals.length > 0) {
        lines.push(`  Signals: ${source.qualitySignals.slice(0, 4).join(" | ")}`);
      }

      const extractionBits = source.extractions
        .slice(0, 3)
        .map((extraction) => `${extraction.kind}: ${extraction.value}`);
      if (extractionBits.length > 0) {
        lines.push(`  Evidence: ${extractionBits.join(" | ")}`);
      }
    }

    lines.push("");
  }

  if (evidence && evidence.clusters.length > 0) {
    lines.push(renderClusterSection(evidence), "");
  }

  if (evidence && evidence.contradictions.length > 0) {
    lines.push(renderContradictionSection(evidence), "");
  }

  if (postDraft) {
    lines.push("## Draft Post", "", postDraft.trim(), "");
  }

  if (commentsDraft) {
    lines.push("## Draft Comments", "", commentsDraft.trim(), "");
  }

  if (state.notes.length > 0) {
    lines.push("## Run Notes", "");
    for (const note of state.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  lines.push("## Next Action", "");
  if (state.status === "waiting_review") {
    lines.push("Review the draft files and approve or revise before anything public gets posted.");
  } else if (state.status === "completed") {
    lines.push("Job completed. Use the report and saved artifacts as the handoff package.");
  } else {
    lines.push("Check the notes above, then resume or rerun the job.");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function shouldGenerateResearchSummary(
  summary: AgentResearchSummary | null,
  evidence: AgentEvidenceBundle
): boolean {
  return (
    !summary ||
    ((summary.referencedEvidence ?? []).length === 0 && evidence.counts.extractions > 0)
  );
}

export class AgentSynthesisStage {
  constructor(private readonly llm: LlmService) {}

  async synthesizePersistedResearch(input: {
    instruction: string;
    evidence: AgentEvidenceBundle;
  }): Promise<AgentResearchSummary> {
    return this.llm.synthesizeAgentEvidence(input);
  }

  writeResearchSummaryArtifact(
    state: AgentRunState,
    summary: AgentResearchSummary,
    evidence: AgentEvidenceBundle
  ): string {
    const outputPath = path.join(state.artifactDir, "research-summary.md");
    fs.writeFileSync(outputPath, `${renderResearchSummary(summary, evidence)}\n`, "utf8");
    state.outputs.researchSummaryPath = outputPath;
    return outputPath;
  }

  writeReportArtifact(state: AgentRunState, jobStore: JobStore): string {
    const evidence = jobStore.getAgentEvidenceBundle();
    fs.writeFileSync(state.reportPath, renderReport(state, evidence), "utf8");
    return state.reportPath;
  }
}
