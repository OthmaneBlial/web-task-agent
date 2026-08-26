import { createHash } from "node:crypto";
import fs from "node:fs";

import type { StoredJobDetail } from "./job-store";
import { redactSensitiveValue } from "./redaction";

export type JobExportFormat = "markdown" | "json" | "csv";

export interface ExportedResearchSource {
  title: string;
  url: string;
  site: string;
  query: string;
  collectedAt: string | null;
  reviewStatus: string | null;
  qualityScore: number | null;
}

export interface JobExportData {
  schemaVersion: 1;
  exportedAt: string;
  job: {
    id: string;
    title: string;
    workflow: string | null;
    taskType: string;
    status: string;
    startedAt: string;
    completedAt: string | null;
    reportPath: string | null;
  };
  runtimeSummary: string;
  evidence: StoredJobDetail["evidenceGraph"];
  sources: ExportedResearchSource[];
  steps: Array<{
    key: string;
    title: string;
    status: string;
    durationMs: number | null;
  }>;
  artifacts: Array<{
    key: string;
    type: string;
    path: string;
  }>;
  recentEvents: Array<{
    createdAt: string;
    type: string;
    message: string;
  }>;
  reportSha256: string | null;
  decisionExcerpt: string | null;
}

function normalizeUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function cleanText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readJson(filePath: string | null): unknown {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readReport(reportPath: string | null): string | null {
  if (!reportPath || !fs.existsSync(reportPath)) {
    return null;
  }
  try {
    return fs.readFileSync(reportPath, "utf8");
  } catch {
    return null;
  }
}

function extractDecisionExcerpt(report: string | null): string | null {
  if (!report) {
    return null;
  }
  const sections = report.split(/^##\s+/m);
  const decisionSection = sections.find((section) => /^(?:Decision|Recommendation|Executive Summary)\s*$/im.test(section.split("\n", 1)[0] ?? ""));
  const excerpt = cleanText(decisionSection?.split("\n").slice(1).join("\n") ?? report.split(/\n\n+/)[0]);
  return excerpt ? excerpt.slice(0, 800) : null;
}

export function collectCachedResearchSources(cachePath: string | null): ExportedResearchSource[] {
  const cached = readJson(cachePath);
  const research = cached && typeof cached === "object" && Array.isArray((cached as { research?: unknown }).research)
    ? (cached as { research: unknown[] }).research
    : [];
  const seen = new Set<string>();
  const sources: ExportedResearchSource[] = [];

  for (const entry of research) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const researchEntry = entry as { searchedAt?: unknown; query?: unknown; results?: unknown };
    if (!Array.isArray(researchEntry.results)) {
      continue;
    }
    for (const result of researchEntry.results) {
      if (!result || typeof result !== "object") {
        continue;
      }
      const value = result as Record<string, unknown>;
      const url = cleanText(value.url);
      const canonicalUrl = normalizeUrl(url);
      if (!canonicalUrl || seen.has(canonicalUrl)) {
        continue;
      }
      seen.add(canonicalUrl);
      sources.push({
        title: cleanText(value.title) || canonicalUrl,
        url: canonicalUrl,
        site: cleanText(value.site),
        query: cleanText(researchEntry.query),
        collectedAt: cleanText((value.page as { capturedAt?: unknown } | undefined)?.capturedAt) || cleanText(researchEntry.searchedAt) || null,
        reviewStatus: cleanText(value.reviewStatus) || null,
        qualityScore: typeof value.qualityScore === "number" ? value.qualityScore : null
      });
    }
  }

  return sources.sort((left, right) => left.url.localeCompare(right.url));
}

export function buildJobExportData(detail: StoredJobDetail, exportedAt: string = new Date().toISOString()): JobExportData {
  const report = readReport(detail.job.reportPath);
  return {
    schemaVersion: 1,
    exportedAt,
    job: {
      id: detail.job.jobId,
      title: detail.job.title,
      workflow: detail.job.workflowName,
      taskType: detail.job.taskType,
      status: detail.job.status,
      startedAt: detail.job.startedAt,
      completedAt: detail.job.completedAt,
      reportPath: detail.job.reportPath
    },
    runtimeSummary: detail.runtimeSummary,
    evidence: detail.evidenceGraph,
    sources: collectCachedResearchSources(detail.job.cachePath),
    steps: detail.steps.map((step) => ({
      key: step.stepKey,
      title: step.title,
      status: step.status,
      durationMs: step.durationMs
    })),
    artifacts: detail.artifacts.map((artifact) => ({
      key: artifact.artifactKey,
      type: artifact.artifactType,
      path: artifact.path
    })),
    recentEvents: detail.events.slice(-50).map((event) => ({
      createdAt: event.createdAt,
      type: event.eventType,
      message: event.message
    })),
    reportSha256: report ? createHash("sha256").update(report).digest("hex") : null,
    decisionExcerpt: extractDecisionExcerpt(report)
  };
}

function escapeCsv(value: unknown): string {
  const normalized = String(value ?? "");
  return /[",\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

function renderMarkdown(data: JobExportData): string {
  const lines = [
    `# Shareable research export — ${data.job.title}`,
    "",
    `- Job: \`${data.job.id}\``,
    `- Workflow: ${data.job.workflow ?? "free-form agent"}`,
    `- Status: ${data.job.status}`,
    `- Exported: ${data.exportedAt}`,
    `- Evidence graph: ${data.evidence.nodes} nodes, ${data.evidence.edges} edges`,
    "",
    "## Decision excerpt",
    "",
    data.decisionExcerpt ?? "No report excerpt is available for this job.",
    "",
    "## Sources",
    ""
  ];

  if (data.sources.length === 0) {
    lines.push("No source snapshot was available in the local job cache.");
  } else {
    for (const source of data.sources) {
      lines.push(`- [${source.title}](${source.url})${source.collectedAt ? ` — collected ${source.collectedAt}` : ""}`);
    }
  }

  lines.push("", "## What could invalidate this", "");
  lines.push("Re-run the decision when sources have changed, the evidence is stale, or an unresolved contradiction affects the recommendation.");
  return `${lines.join("\n")}\n`;
}

function renderCsv(data: JobExportData): string {
  const header = ["title", "url", "site", "query", "collected_at", "review_status", "quality_score"];
  const rows = data.sources.map((source) => [
    source.title,
    source.url,
    source.site,
    source.query,
    source.collectedAt ?? "",
    source.reviewStatus ?? "",
    source.qualityScore ?? ""
  ]);
  return `${[header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n")}\n`;
}

export function renderJobExport(data: JobExportData, format: JobExportFormat, redact: boolean = false): string {
  const safeData = (redact ? redactSensitiveValue(data) : data) as JobExportData;
  if (format === "markdown") {
    return renderMarkdown(safeData);
  }
  if (format === "csv") {
    return renderCsv(safeData);
  }
  return `${JSON.stringify(safeData, null, 2)}\n`;
}

export interface JobComparison {
  leftJobId: string;
  rightJobId: string;
  newSources: ExportedResearchSource[];
  disappearedSources: ExportedResearchSource[];
  reportChanged: boolean;
  decisionChanged: boolean;
  leftDecisionExcerpt: string | null;
  rightDecisionExcerpt: string | null;
}

export function compareJobExports(left: JobExportData, right: JobExportData): JobComparison {
  const leftByUrl = new Map(left.sources.map((source) => [source.url, source]));
  const rightByUrl = new Map(right.sources.map((source) => [source.url, source]));
  return {
    leftJobId: left.job.id,
    rightJobId: right.job.id,
    newSources: right.sources.filter((source) => !leftByUrl.has(source.url)),
    disappearedSources: left.sources.filter((source) => !rightByUrl.has(source.url)),
    reportChanged: left.reportSha256 !== right.reportSha256,
    decisionChanged: left.decisionExcerpt !== right.decisionExcerpt,
    leftDecisionExcerpt: left.decisionExcerpt,
    rightDecisionExcerpt: right.decisionExcerpt
  };
}

export function renderJobComparison(comparison: JobComparison, format: "markdown" | "json", redact: boolean = false): string {
  const safeComparison = (redact ? redactSensitiveValue(comparison) : comparison) as JobComparison;
  if (format === "json") {
    return `${JSON.stringify(safeComparison, null, 2)}\n`;
  }
  const lines = [
    `# Job comparison — ${safeComparison.leftJobId} → ${safeComparison.rightJobId}`,
    "",
    `- Report changed: ${safeComparison.reportChanged ? "yes" : "no"}`,
    `- Decision excerpt changed: ${safeComparison.decisionChanged ? "yes" : "no"}`,
    "",
    "## New sources",
    "",
    ...(safeComparison.newSources.length > 0 ? safeComparison.newSources.map((source) => `- [${source.title}](${source.url})`) : ["None."]),
    "",
    "## Sources no longer present",
    "",
    ...(safeComparison.disappearedSources.length > 0 ? safeComparison.disappearedSources.map((source) => `- [${source.title}](${source.url})`) : ["None."]),
    "",
    "## Decision excerpts",
    "",
    `- Earlier: ${safeComparison.leftDecisionExcerpt ?? "not available"}`,
    `- Later: ${safeComparison.rightDecisionExcerpt ?? "not available"}`
  ];
  return `${lines.join("\n")}\n`;
}
