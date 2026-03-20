import fs from "node:fs";
import path from "node:path";

import { createOrResumeState, createRunId, ensureDir, saveTaskState, writeJsonAtomic } from "../lib/cache";
import {
  captureScreenshot,
  closePageSession,
  createPageSession,
  ensureDebuggerReady,
  evaluateInBrowser,
  sleep,
  waitForAnySelector,
  waitForLoadEvent,
  waitForNetworkIdle
} from "../lib/cdp";
import { loadAgentMemory } from "../lib/agent-memory";
import { JobStore } from "../lib/job-store";
import { LlmService } from "../lib/llm";
import { humanScroll } from "../lib/humanizer";
import { BaseTask } from "./BaseTask";
import type {
  AgentCommentsDraft,
  AgentEvidenceBundle,
  AgentPageDigest,
  AgentPlan,
  AgentResearchResult,
  AgentRunOptions,
  AgentRunState,
  AgentSearchResult,
  AgentStepKind,
  AgentResearchSummary,
  CDPClient,
  TaskJobInfo
} from "../types";

interface AgentTaskResult extends TaskJobInfo {
  cachePath: string;
  reportPath: string;
  artifactDir: string;
  status: AgentRunState["status"];
  estimatedMinutes: number;
}

const QUERY_SCAN_MIN_MS = 4_000;
const QUERY_SCAN_MAX_MS = 8_000;
const ARTICLE_READ_MIN_MS = 10_000;
const ARTICLE_READ_MAX_MS = 20_000;
const QUICK_SKIP_MIN_MS = 700;
const QUICK_SKIP_MAX_MS = 1_800;
const MAX_ARTICLES_PER_QUERY = 3;
const AVERAGE_ARTICLE_READ_MS = Math.round((ARTICLE_READ_MIN_MS + ARTICLE_READ_MAX_MS) / 2);
const AVERAGE_QUERY_SCAN_MS = Math.round((QUERY_SCAN_MIN_MS + QUERY_SCAN_MAX_MS) / 2);

function defaultReportPath(runId: string): string {
  return path.join(process.cwd(), "reports", `agent-job-${runId}`, "report.md");
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "item";
}

function nowIso(): string {
  return new Date().toISOString();
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.round(randomBetween(min, max));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function pageContentLength(page: AgentPageDigest): number {
  return [
    page.title,
    page.description,
    page.h1 ?? "",
    ...page.headings,
    ...page.paragraphs
  ]
    .join(" ")
    .trim().length;
}

function looksLikeErrorPage(page: AgentPageDigest): boolean {
  const haystack = [page.title, page.h1 ?? "", page.description, ...page.headings]
    .join(" ")
    .toLowerCase();
  const errorTerms = [
    "404",
    "not found",
    "error",
    "access denied",
    "forbidden",
    "just a moment",
    "attention required",
    "captcha",
    "sign in",
    "log in"
  ];

  return errorTerms.some((term) => haystack.includes(term));
}

function isReadablePage(page: AgentPageDigest): boolean {
  if (looksLikeErrorPage(page)) {
    return false;
  }

  const contentSignals =
    (page.h1 ? 1 : 0) +
    (page.description.length >= 90 ? 1 : 0) +
    Math.min(2, page.headings.length) +
    Math.min(3, page.paragraphs.length * 2);

  return contentSignals >= 3 || pageContentLength(page) >= 320;
}

function estimateArticleReadMs(page: AgentPageDigest): number {
  const richness = clamp((pageContentLength(page) - 220) / 1_600, 0, 1);
  const estimated =
    ARTICLE_READ_MIN_MS + richness * (ARTICLE_READ_MAX_MS - ARTICLE_READ_MIN_MS) + randomBetween(-4_000, 4_000);
  return clamp(Math.round(estimated), ARTICLE_READ_MIN_MS, ARTICLE_READ_MAX_MS);
}

function computeExecutionEstimateMinutes(plan: AgentPlan, maxResultsPerQuery: number): number {
  const queries = plan.researchQueries.length;
  const visitedArticlesPerQuery = Math.min(MAX_ARTICLES_PER_QUERY, maxResultsPerQuery);
  const researchMs =
    queries * AVERAGE_QUERY_SCAN_MS +
    queries * visitedArticlesPerQuery * AVERAGE_ARTICLE_READ_MS +
    queries * 4_000;
  const draftingMs =
    (plan.steps.some((step) => step.kind === "draft_post") ? 30_000 : 0) +
    (plan.steps.some((step) => step.kind === "draft_comments") ? 20_000 : 0) +
    15_000;

  return Math.max(1, Math.round((researchMs + draftingMs) / 60_000));
}

function updateStepStatus(
  plan: AgentPlan | null,
  kind: AgentStepKind,
  status: "pending" | "running" | "completed" | "failed" | "skipped"
): void {
  const step = plan?.steps.find((candidate) => candidate.kind === kind);
  if (step) {
    step.status = status;
  }
}

function appendNote(state: AgentRunState, message: string): void {
  state.notes.push(`[${nowIso()}] ${message}`);
}

function buildInitialState(options: AgentRunOptions): AgentRunState {
  const runId = createRunId();
  const reportPath = path.resolve(options.reportPath ?? defaultReportPath(runId));
  const artifactDir = path.dirname(reportPath);

  return {
    task: "agent",
    runId,
    startedAt: nowIso(),
    updatedAt: nowIso(),
    status: "planning",
    input: {
      instruction: options.instruction,
      memoryPath: options.memoryPath ? path.resolve(options.memoryPath) : null,
      maxQueries: Math.max(0, Math.min(5, options.maxQueries ?? 3)),
      maxResultsPerQuery: Math.max(1, Math.min(10, options.maxResultsPerQuery ?? 5))
    },
    reportPath,
    artifactDir,
    plan: null,
    research: [],
    researchSummary: null,
    outputs: {
      planPath: null,
      researchSummaryPath: null,
      postDraftPath: null,
      commentsDraftPath: null
    },
    notes: []
  };
}

function hasStep(plan: AgentPlan | null, kind: AgentStepKind): boolean {
  return Boolean(plan?.steps.some((step) => step.kind === kind));
}

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

  return lines.join("\n").trim();
}

function renderClusterSection(evidence: AgentEvidenceBundle): string {
  if (evidence.clusters.length === 0) {
    return "";
  }

  const lines = ["## Repeated Evidence Clusters", ""];

  for (const cluster of evidence.clusters.slice(0, 12)) {
    const supportMeta =
      `${cluster.kind} | ${cluster.sourceCount} sources | ${cluster.evidenceCount} evidence items | confidence ${(cluster.averageConfidence * 100).toFixed(0)}% | score ${(cluster.overallScore * 100).toFixed(0)}%`;
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

function renderResearchSummary(summary: AgentResearchSummary, evidence?: AgentEvidenceBundle | null): string {
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

function countCapturedResearchSources(research: AgentResearchResult[]): number {
  return research.reduce((total, entry) => total + entry.results.length, 0);
}

function countCapturedResearchDocuments(research: AgentResearchResult[]): number {
  return research.reduce(
    (total, entry) => total + entry.results.filter((result) => Boolean(result.page)).length,
    0
  );
}

function renderReport(state: AgentRunState, evidence?: AgentEvidenceBundle | null): string {
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
        `  Site: ${source.site || "unknown"} | quality ${(source.sourceQualityScore * 100).toFixed(0)}% | freshness ${(source.freshnessScore * 100).toFixed(0)}% | score ${(source.overallScore * 100).toFixed(0)}%`
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

export class AgentRunnerTask extends BaseTask<AgentRunOptions, AgentTaskResult> {
  private readonly llm = new LlmService();

  private async softWaitForNetworkIdle(client: CDPClient): Promise<void> {
    try {
      await waitForNetworkIdle(client, {
        timeoutMs: 6_000,
        idleTimeMs: 900,
        maxInflightRequests: 3
      });
    } catch {
      return;
    }
  }

  private buildSearchUrl(query: string): string {
    return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  }

  private async waitForSearchResults(client: CDPClient): Promise<void> {
    await waitForLoadEvent(client, 20_000);

    try {
      await waitForAnySelector(client, [".result__a", ".results .result", "a.result__url"], {
        timeoutMs: 20_000
      });
      await this.softWaitForNetworkIdle(client);
    } catch (error) {
      const pageContext = await evaluateInBrowser<{
        title: string;
        url: string;
        bodyStart: string;
      }>(
        client,
        `() => ({
          title: document.title || "",
          url: window.location.href,
          bodyStart: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 240)
        })`
      );

      throw new Error(
        `${error instanceof Error ? error.message : String(error)
        } | loaded page: ${pageContext.title} | ${pageContext.url} | ${pageContext.bodyStart}`
      );
    }
  }

  private async scrapeSearchResults(
    client: CDPClient,
    maxResults: number
  ): Promise<AgentSearchResult[]> {
    return evaluateInBrowser<AgentSearchResult[]>(
      client,
      `(inputMaxResults) => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const siteOf = (rawUrl) => {
          try {
            return new URL(rawUrl).hostname.replace(/^www\\./, "");
          } catch {
            return "";
          }
        };

        const results = [];
        const seen = new Set();

        // DuckDuckGo HTML lite uses .result class with .result__a for the title link.
        const cards = Array.from(document.querySelectorAll(".result, .results_links"));

        for (const card of cards) {
          const anchor = card.querySelector(".result__a, a.result__a");
          if (!anchor) {
            continue;
          }

          let href = anchor.getAttribute("href") || "";
          if (!href) {
            continue;
          }

          // DuckDuckGo sometimes wraps URLs in a redirect; extract the actual URL.
          if (href.includes("uddg=")) {
            try {
              const uddg = new URL(href, window.location.origin).searchParams.get("uddg");
              if (uddg) {
                href = uddg;
              }
            } catch {
              // Use href as-is.
            }
          }

          let url = null;
          try {
            const parsed = new URL(href, window.location.origin);
            if (parsed.protocol === "http:" || parsed.protocol === "https:") {
              url = parsed.toString();
            }
          } catch {
            url = null;
          }

          if (!url || seen.has(url)) {
            continue;
          }

          const title = normalize(anchor.textContent) || url;
          const snippet =
            normalize(card.querySelector(".result__snippet")?.textContent) ||
            normalize(card.querySelector(".result__body")?.textContent) ||
            "";

          results.push({
            title,
            url,
            snippet,
            site: siteOf(url)
          });
          seen.add(url);

          if (results.length >= Number(inputMaxResults)) {
            break;
          }
        }

        return results;
      }`,
      [maxResults]
    );
  }

  private async scrapePageDigest(client: CDPClient): Promise<AgentPageDigest> {
    return evaluateInBrowser<AgentPageDigest>(
      client,
      `() => {
        const normalize = (value) => (value || "").replace(/\\s+/g, " ").trim();
        const meta = (selector) => normalize(document.querySelector(selector)?.getAttribute("content")) || "";

        return {
          title: normalize(document.title) || window.location.hostname,
          url: window.location.href,
          description:
            meta('meta[name="description"]') ||
            meta('meta[property="og:description"]') ||
            "",
          h1: normalize(document.querySelector("h1")?.textContent) || null,
          headings: Array.from(document.querySelectorAll("h2, h3"))
            .map((node) => normalize(node.textContent))
            .filter((text) => text.length > 4)
            .slice(0, 6),
          paragraphs: Array.from(document.querySelectorAll("main p, article p, p"))
            .map((node) => normalize(node.textContent))
            .filter((text) => text.length >= 80)
            .slice(0, 4),
          capturedAt: new Date().toISOString()
        };
      }`
    );
  }

  private async scanSearchResultsPage(client: CDPClient, query: string): Promise<void> {
    const dwellMs = randomInt(QUERY_SCAN_MIN_MS, QUERY_SCAN_MAX_MS);
    const segments = randomInt(2, 3);
    let remainingMs = dwellMs;

    this.log(`scanning results for "${query}" for about ${Math.round(dwellMs / 1000)}s`);

    for (let index = 0; index < segments; index += 1) {
      const stagesLeft = segments - index;
      const minTailMs = (stagesLeft - 1) * 1_500;
      const maxPauseMs = Math.max(1_500, remainingMs - minTailMs);
      const pauseMs =
        index === segments - 1
          ? remainingMs
          : clamp(
            Math.round(remainingMs / stagesLeft + randomBetween(-500, 900)),
            1_500,
            maxPauseMs
          );

      await sleep(pauseMs, 0.08);
      remainingMs -= pauseMs;

      if (index < segments - 1) {
        await humanScroll(client, {
          distancePx: randomBetween(450, 850),
          tickCount: randomInt(4, 6)
        });
      }
    }
  }

  private async readOpenedPage(
    client: CDPClient,
    result: AgentSearchResult,
    page: AgentPageDigest
  ): Promise<Pick<AgentSearchResult, "reviewStatus" | "dwellSeconds" | "skipReason">> {
    if (!isReadablePage(page)) {
      const skipReason = looksLikeErrorPage(page) ? "error-like page" : "thin content";
      const skipMs = randomInt(QUICK_SKIP_MIN_MS, QUICK_SKIP_MAX_MS);
      this.log(`skipping page quickly: ${page.title || result.title} (${skipReason})`);
      await sleep(skipMs, 0.05);
      return {
        reviewStatus: "skipped",
        dwellSeconds: Math.max(1, Math.round(skipMs / 1000)),
        skipReason
      };
    }

    const dwellMs = estimateArticleReadMs(page);
    const segments = Math.max(3, Math.min(6, Math.round(dwellMs / 10_000)));
    let remainingMs = dwellMs;
    this.log(`reading article: ${page.title || result.title} for about ${Math.round(dwellMs / 1000)}s`);

    for (let index = 0; index < segments; index += 1) {
      const stagesLeft = segments - index;
      const minTailMs = (stagesLeft - 1) * 2_500;
      const maxPauseMs = Math.max(2_500, remainingMs - minTailMs);
      const pauseMs =
        index === segments - 1
          ? remainingMs
          : clamp(
            Math.round(remainingMs / stagesLeft + randomBetween(-1_000, 1_400)),
            2_500,
            maxPauseMs
          );

      await sleep(pauseMs, 0.08);
      remainingMs -= pauseMs;

      if (index < segments - 1) {
        await humanScroll(client, {
          distancePx: randomBetween(520, 1_050),
          tickCount: randomInt(4, 7)
        });

        if (Math.random() < 0.22) {
          await humanScroll(client, {
            direction: "up",
            distancePx: randomBetween(120, 260),
            tickCount: randomInt(3, 4)
          });
        }
      }
    }

    return {
      reviewStatus: "read",
      dwellSeconds: Math.round(dwellMs / 1000)
    };
  }

  private async visitResultPages(results: AgentSearchResult[]): Promise<AgentSearchResult[]> {
    const enriched: AgentSearchResult[] = [];

    for (const result of results) {
      let client: CDPClient | null = null;

      try {
        this.log(`opening article: ${result.title}`);
        client = await createPageSession(result.url);
        await this.softWaitForNetworkIdle(client);
        result.page = await this.scrapePageDigest(client);
        Object.assign(result, await this.readOpenedPage(client, result, result.page));
      } catch (error) {
        result.page = undefined;
        result.reviewStatus = "error";
        result.skipReason = error instanceof Error ? error.message : String(error);
        this.log(`failed article: ${result.title} (${result.skipReason})`);
      } finally {
        if (client) {
          await closePageSession(client);
        }
      }

      enriched.push(result);
      await sleep(220, 0.1);
    }

    return enriched;
  }

  private async collectSearchResults(
    query: string,
    maxResultsPerQuery: number
  ): Promise<AgentSearchResult[]> {
    let client: CDPClient | null = null;

    try {
      client = await createPageSession(this.buildSearchUrl(query));
      await this.waitForSearchResults(client);
      await this.scanSearchResultsPage(client, query);
      return await this.scrapeSearchResults(client, maxResultsPerQuery);
    } catch (error) {
      if (client) {
        const screenshotPath = path.join("/tmp", `agent-research-${Date.now()}.png`);
        try {
          await captureScreenshot(client, screenshotPath);
        } catch {
          // Ignore screenshot failures.
        }
      }

      throw error;
    } finally {
      if (client) {
        await closePageSession(client);
      }
    }
  }

  private async runResearchQuery(query: string, maxResultsPerQuery: number): Promise<AgentResearchResult> {
    let rawResults: AgentSearchResult[];

    try {
      rawResults = await this.collectSearchResults(query, maxResultsPerQuery);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        query,
        searchedAt: nowIso(),
        results: [],
        error: errorMessage
      };
    }

    if (rawResults.length === 0) {
      return {
        query,
        searchedAt: nowIso(),
        results: [],
        error: "no search results were collected"
      };
    }

    const enriched = await this.visitResultPages(
      rawResults.slice(0, Math.min(MAX_ARTICLES_PER_QUERY, rawResults.length))
    );
    const byUrl = new Map(enriched.map((entry) => [entry.url, entry]));
    const merged = rawResults.map((entry) => byUrl.get(entry.url) ?? entry);

    return {
      query,
      searchedAt: nowIso(),
      results: merged
    };
  }

  private saveState(cachePath: string, state: AgentRunState): void {
    state.updatedAt = nowIso();
    saveTaskState("agent", cachePath, state);
  }

  private writeDraftFiles(
    state: AgentRunState,
    postDraft: { headline: string; body: string; callToAction: string } | null,
    commentsDraft: AgentCommentsDraft | null
  ): void {
    ensureDir(state.artifactDir);

    if (postDraft && !state.outputs.postDraftPath) {
      const postPath = path.join(state.artifactDir, "post-draft.md");
      const contents = [
        `# ${postDraft.headline}`,
        "",
        postDraft.body,
        "",
        `CTA: ${postDraft.callToAction}`
      ].join("\n");
      fs.writeFileSync(postPath, `${contents.trim()}\n`, "utf8");
      state.outputs.postDraftPath = postPath;
    }

    if (commentsDraft && !state.outputs.commentsDraftPath) {
      const commentsPath = path.join(state.artifactDir, "comments-draft.md");
      const lines = ["# Draft Comments", ""];
      commentsDraft.comments.forEach((comment, index) => {
        lines.push(`${index + 1}. ${comment}`);
      });
      fs.writeFileSync(commentsPath, `${lines.join("\n").trim()}\n`, "utf8");
      state.outputs.commentsDraftPath = commentsPath;
    }
  }

  private syncArtifacts(jobStore: JobStore, state: AgentRunState): void {
    if (state.outputs.planPath && fs.existsSync(state.outputs.planPath)) {
      jobStore.registerArtifact("plan", "json_plan", state.outputs.planPath, {
        kind: "plan"
      });
    }

    if (state.outputs.researchSummaryPath && fs.existsSync(state.outputs.researchSummaryPath)) {
      jobStore.registerArtifact("research_summary", "markdown_summary", state.outputs.researchSummaryPath, {
        kind: "research_summary"
      });
    }

    if (state.outputs.postDraftPath && fs.existsSync(state.outputs.postDraftPath)) {
      jobStore.registerArtifact("post_draft", "markdown_draft", state.outputs.postDraftPath, {
        kind: "post_draft"
      });
    }

    if (state.outputs.commentsDraftPath && fs.existsSync(state.outputs.commentsDraftPath)) {
      jobStore.registerArtifact("comments_draft", "markdown_draft", state.outputs.commentsDraftPath, {
        kind: "comments_draft"
      });
    }

    if (fs.existsSync(state.reportPath)) {
      jobStore.registerArtifact("report", "markdown_report", state.reportPath, {
        kind: "report"
      });
    }
  }

  async run(): Promise<AgentTaskResult> {
    const { state, cachePath, resumed } = createOrResumeState<AgentRunState>({
      task: "agent",
      resume: this.options.resume,
      cachePath: this.options.cachePath,
      cacheDir: this.options.cacheDir,
      createInitialState: () => buildInitialState(this.options)
    });

    ensureDir(state.artifactDir);

    const jobStore = new JobStore({
      jobId: state.runId,
      taskType: "agent",
      workflowName: "agent-runner",
      title: state.input.instruction.slice(0, 200),
      instruction: state.input.instruction,
      status: state.status === "failed" ? "planning" : state.status,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
      cachePath,
      reportPath: state.reportPath,
      artifactDir: state.artifactDir,
      input: state.input,
      budget: {
        maxQueries: state.input.maxQueries,
        maxResultsPerQuery: state.input.maxResultsPerQuery
      },
      output: {
        researchQueriesCompleted: state.research.length
      }
    });
    jobStore.registerArtifact("cache", "cache_state", cachePath, {
      task: "agent"
    });
    this.syncArtifacts(jobStore, state);

    const summarizeResearch = (): {
      researchQueriesCompleted: number;
      sourcesCaptured: number;
      documentsCaptured: number;
      researchErrors: number;
    } => ({
      researchQueriesCompleted: state.research.length,
      sourcesCaptured: countCapturedResearchSources(state.research),
      documentsCaptured: countCapturedResearchDocuments(state.research),
      researchErrors: state.research.filter((entry) => Boolean(entry.error)).length
    });
    let evidenceBundle: AgentEvidenceBundle | null = null;

    const planStep = {
      stepKey: "plan_job",
      title: "Plan the job",
      kind: "plan",
      position: 1,
      input: {
        instruction: state.input.instruction,
        maxQueries: state.input.maxQueries
      }
    };
    const researchStep = {
      stepKey: "research",
      title: "Run browser research",
      kind: "research",
      position: 2,
      input: {
        maxQueries: state.input.maxQueries,
        maxResultsPerQuery: state.input.maxResultsPerQuery
      }
    };
    const summaryStep = {
      stepKey: "synthesize_research",
      title: "Synthesize research findings",
      kind: "analyze",
      position: 3
    };
    const postDraftStep = {
      stepKey: "draft_post",
      title: "Draft post",
      kind: "draft_post",
      position: 4
    };
    const commentsDraftStep = {
      stepKey: "draft_comments",
      title: "Draft comments",
      kind: "draft_comments",
      position: 5
    };
    const reviewStep = {
      stepKey: "review",
      title: "Wait for human review",
      kind: "review",
      position: 6
    };
    const reportStep = {
      stepKey: "write_report",
      title: "Write final report",
      kind: "report",
      position: 7,
      input: {
        reportPath: state.reportPath
      }
    };

    this.log(
      resumed
        ? `resuming agent run from ${cachePath}`
        : `starting agent run for: ${state.input.instruction}`
    );

    await ensureDebuggerReady();
    this.log("attached to Lightpanda CDP server");

    const memory = loadAgentMemory(this.options.memoryPath ?? state.input.memoryPath ?? undefined);
    if (memory && state.input.memoryPath !== memory.path) {
      state.input.memoryPath = memory.path;
      jobStore.syncJob({
        input: state.input
      });
    }

    try {
      if (!state.plan) {
        state.status = "planning";
        appendNote(state, "Planning the job.");
        this.saveState(cachePath, state);
        jobStore.syncJob({
          status: "planning",
          updatedAt: state.updatedAt,
          input: state.input
        });
        jobStore.startStep(planStep);

        try {
          state.plan = await this.llm.planAgentJob({
            instruction: state.input.instruction,
            memory: memory?.content,
            maxQueries: state.input.maxQueries
          });
          state.plan.estimatedMinutes = computeExecutionEstimateMinutes(
            state.plan,
            state.input.maxResultsPerQuery
          );
          state.outputs.planPath = path.join(state.artifactDir, "plan.json");
          writeJsonAtomic(state.outputs.planPath, state.plan);
          this.syncArtifacts(jobStore, state);
          appendNote(
            state,
            `Plan created with ${state.plan.steps.length} steps and a ${state.plan.estimatedMinutes} minute execution estimate.`
          );
          this.saveState(cachePath, state);
          jobStore.completeStep(planStep, {
            estimatedMinutes: state.plan.estimatedMinutes,
            deliverables: state.plan.deliverables.length,
            researchQueries: state.plan.researchQueries.length,
            planPath: state.outputs.planPath
          });
          jobStore.syncJob({
            status: "planning",
            updatedAt: state.updatedAt,
            output: {
              estimatedMinutes: state.plan.estimatedMinutes,
              planSteps: state.plan.steps.length
            }
          });
        } catch (error) {
          jobStore.failStep(planStep, error);
          throw error;
        }
      } else {
        jobStore.completeStep(planStep, {
          reused: true,
          estimatedMinutes: state.plan.estimatedMinutes,
          planPath: state.outputs.planPath
        });
        this.syncArtifacts(jobStore, state);
      }

      if (!state.plan) {
        throw new Error("agent plan is missing after planning");
      }

      const executionEstimate = computeExecutionEstimateMinutes(
        state.plan,
        state.input.maxResultsPerQuery
      );
      if (state.plan.estimatedMinutes !== executionEstimate) {
        state.plan.estimatedMinutes = executionEstimate;
        appendNote(
          state,
          `Execution estimate recalculated from browsing policy: ${executionEstimate} minutes.`
        );
        this.saveState(cachePath, state);
        if (state.outputs.planPath) {
          writeJsonAtomic(state.outputs.planPath, state.plan);
          this.syncArtifacts(jobStore, state);
        }
      }

      if (state.plan.researchQueries.length > 0) {
        state.status = "running";
        updateStepStatus(state.plan, "research", "running");
        this.saveState(cachePath, state);
        jobStore.syncJob({
          status: "running",
          updatedAt: state.updatedAt,
          output: {
            estimatedMinutes: state.plan.estimatedMinutes,
            ...summarizeResearch()
          }
        });

        const doneQueries = new Set(state.research.map((entry) => entry.query.toLowerCase()));
        const pendingQueries = state.plan.researchQueries.filter(
          (query) => !doneQueries.has(query.toLowerCase())
        );
        const researchDir = path.join(state.artifactDir, "research");
        ensureDir(researchDir);

        for (const existing of state.research) {
          jobStore.persistAgentResearchResult(existing, {
            searchProvider: "duckduckgo_html",
            searchUrl: this.buildSearchUrl(existing.query)
          });
        }

        if (pendingQueries.length > 0) {
          await jobStore.runStep(
            researchStep,
            async () => {
              for (const query of pendingQueries) {
                this.log(`researching: ${query}`);
                const result = await this.runResearchQuery(query, state.input.maxResultsPerQuery);
                state.research.push(result);
                const rawPath = path.join(researchDir, `${slugify(query)}.json`);
                writeJsonAtomic(rawPath, result);
                jobStore.registerArtifact(`research_${slugify(query)}`, "research_json", rawPath, {
                  query
                });
                jobStore.persistAgentResearchResult(result, {
                  searchProvider: "duckduckgo_html",
                  searchUrl: this.buildSearchUrl(query)
                });
                appendNote(
                  state,
                  result.error
                    ? `Research query failed: ${query} (${result.error})`
                    : `Research query captured ${result.results.length} sources: ${query}`
                );
                this.saveState(cachePath, state);
                jobStore.syncJob({
                  status: "running",
                  updatedAt: state.updatedAt,
                  output: {
                    estimatedMinutes: state.plan!.estimatedMinutes,
                    ...summarizeResearch()
                  }
                });
              }

              return summarizeResearch();
            },
            {
              output: (result) => result
            }
          );
        } else {
          jobStore.completeStep(researchStep, {
            reused: true,
            ...summarizeResearch()
          });
        }

        evidenceBundle = jobStore.getAgentEvidenceBundle();

        updateStepStatus(state.plan, "research", "completed");
        this.saveState(cachePath, state);
      } else {
        jobStore.markSkipped(researchStep, {
          reason: "no research queries planned"
        });
        evidenceBundle = jobStore.getAgentEvidenceBundle();
      }

      evidenceBundle = evidenceBundle ?? jobStore.getAgentEvidenceBundle();

      if (evidenceBundle.counts.sources > 0) {
        const summaryNeedsEvidenceRefs =
          !state.researchSummary ||
          ((state.researchSummary.referencedEvidence ?? []).length === 0 &&
            evidenceBundle.counts.extractions > 0);

        if (summaryNeedsEvidenceRefs) {
          state.status = "running";
          const summary = await jobStore.runStep(
            summaryStep,
            async () => this.llm.synthesizeAgentEvidence({
              instruction: state.input.instruction,
              evidence: evidenceBundle!
            }),
            {
              output: (result) => ({
                keyFindings: result.keyFindings.length,
                contentAngles: result.contentAngles.length,
                evidenceSources: evidenceBundle!.counts.sources,
                evidenceExtractions: evidenceBundle!.counts.extractions,
                referencedEvidence: result.referencedEvidence.length
              })
            }
          );
          state.researchSummary = summary;
          state.outputs.researchSummaryPath = path.join(state.artifactDir, "research-summary.md");
          fs.writeFileSync(
            state.outputs.researchSummaryPath,
            `${renderResearchSummary(summary, evidenceBundle)}\n`,
            "utf8"
          );
          this.syncArtifacts(jobStore, state);
          appendNote(state, "Research summary generated.");
          this.saveState(cachePath, state);
          jobStore.completeStep(summaryStep, {
            keyFindings: summary.keyFindings.length,
            contentAngles: summary.contentAngles.length,
            evidenceSources: evidenceBundle.counts.sources,
            evidenceExtractions: evidenceBundle.counts.extractions,
            referencedEvidence: summary.referencedEvidence.length,
            researchSummaryPath: state.outputs.researchSummaryPath
          });
        } else {
          const existingSummary = state.researchSummary!;
          jobStore.completeStep(summaryStep, {
            reused: true,
            keyFindings: existingSummary.keyFindings.length,
            contentAngles: existingSummary.contentAngles.length,
            evidenceSources: evidenceBundle.counts.sources,
            evidenceExtractions: evidenceBundle.counts.extractions,
            referencedEvidence: (existingSummary.referencedEvidence ?? []).length,
            researchSummaryPath: state.outputs.researchSummaryPath
          });
        }
      } else {
        jobStore.markSkipped(summaryStep, {
          reason: "no persisted evidence was collected"
        });
      }

      let postDraft: { headline: string; body: string; callToAction: string } | null = null;
      let commentsDraft: AgentCommentsDraft | null = null;

      if (hasStep(state.plan, "draft_post")) {
        if (!state.outputs.postDraftPath) {
          state.status = "running";
          updateStepStatus(state.plan, "draft_post", "running");
          this.saveState(cachePath, state);
          postDraft = await jobStore.runStep(
            postDraftStep,
            async () => this.llm.draftAgentPost({
              instruction: state.input.instruction,
              plan: state.plan!,
              researchSummary: state.researchSummary,
              memory: memory?.content
            }),
            {
              output: (result) => ({
                headline: result.headline
              })
            }
          );
          updateStepStatus(state.plan, "draft_post", "completed");
          appendNote(state, "Draft post generated.");
          this.saveState(cachePath, state);
        } else {
          jobStore.completeStep(postDraftStep, {
            reused: true,
            postDraftPath: state.outputs.postDraftPath
          });
        }
      } else {
        jobStore.markSkipped(postDraftStep, {
          reason: "post draft not requested by the plan"
        });
      }

      if (hasStep(state.plan, "draft_comments")) {
        if (!state.outputs.commentsDraftPath) {
          state.status = "running";
          updateStepStatus(state.plan, "draft_comments", "running");
          this.saveState(cachePath, state);
          commentsDraft = await jobStore.runStep(
            commentsDraftStep,
            async () => this.llm.draftAgentComments({
              instruction: state.input.instruction,
              plan: state.plan!,
              researchSummary: state.researchSummary,
              memory: memory?.content,
              count: 5
            }),
            {
              output: (result) => ({
                commentsCount: result.comments.length
              })
            }
          );
          updateStepStatus(state.plan, "draft_comments", "completed");
          appendNote(state, "Draft comments generated.");
          this.saveState(cachePath, state);
        } else {
          jobStore.completeStep(commentsDraftStep, {
            reused: true,
            commentsDraftPath: state.outputs.commentsDraftPath
          });
        }
      } else {
        jobStore.markSkipped(commentsDraftStep, {
          reason: "comment drafts not requested by the plan"
        });
      }

      this.writeDraftFiles(state, postDraft, commentsDraft);
      this.syncArtifacts(jobStore, state);
      if (hasStep(state.plan, "draft_post") && state.outputs.postDraftPath) {
        jobStore.completeStep(postDraftStep, {
          headline: postDraft?.headline ?? null,
          postDraftPath: state.outputs.postDraftPath
        });
      }
      if (hasStep(state.plan, "draft_comments") && state.outputs.commentsDraftPath) {
        jobStore.completeStep(commentsDraftStep, {
          commentsCount: commentsDraft?.comments.length ?? null,
          commentsDraftPath: state.outputs.commentsDraftPath
        });
      }

      updateStepStatus(state.plan, "report", "completed");

      const hasDrafts = Boolean(state.outputs.postDraftPath || state.outputs.commentsDraftPath);
      state.status = state.plan.approvalRequired || hasDrafts ? "waiting_review" : "completed";
      if (hasStep(state.plan, "review")) {
        updateStepStatus(state.plan, "review", state.status === "waiting_review" ? "pending" : "completed");
      }
      appendNote(
        state,
        state.status === "waiting_review"
          ? "Drafts are ready and waiting for review."
          : "Job completed."
      );

      await jobStore.runStep(
        reportStep,
        async () => {
          const latestEvidence = jobStore.getAgentEvidenceBundle();
          fs.writeFileSync(state.reportPath, renderReport(state, latestEvidence), "utf8");
          return {
            reportPath: state.reportPath
          };
        },
        {
          output: (result) => result
        }
      );
      this.syncArtifacts(jobStore, state);

      if (hasStep(state.plan, "review")) {
        if (state.status === "waiting_review") {
          jobStore.markPending(reviewStep, {
            reason: "waiting for human review"
          });
        } else {
          jobStore.completeStep(reviewStep, {
            reason: "review step completed during the same run"
          });
        }
      } else {
        jobStore.markSkipped(reviewStep, {
          reason: "no review step in the plan"
        });
      }

      this.saveState(cachePath, state);
      jobStore.setStatus(state.status, {
        output: {
          estimatedMinutes: state.plan.estimatedMinutes,
          ...summarizeResearch(),
          hasPostDraft: Boolean(state.outputs.postDraftPath),
          hasCommentsDraft: Boolean(state.outputs.commentsDraftPath),
          reportPath: state.reportPath
        },
        completedAt: state.status === "completed" ? state.updatedAt : null
      });

      return {
        jobId: state.runId,
        databasePath: jobStore.databasePath,
        cachePath,
        reportPath: state.reportPath,
        artifactDir: state.artifactDir,
        status: state.status,
        estimatedMinutes: state.plan.estimatedMinutes
      };
    } catch (error) {
      state.status = "failed";
      updateStepStatus(state.plan, "report", "failed");
      appendNote(
        state,
        `Run failed: ${error instanceof Error ? error.message : String(error)}`
      );
      this.saveState(cachePath, state);
      jobStore.setStatus("failed", {
        output: {
          estimatedMinutes: state.plan?.estimatedMinutes ?? null,
          ...summarizeResearch(),
          hasPostDraft: Boolean(state.outputs.postDraftPath),
          hasCommentsDraft: Boolean(state.outputs.commentsDraftPath)
        },
        errorMessage: error instanceof Error ? error.stack ?? error.message : String(error),
        completedAt: state.updatedAt
      });
      throw error;
    }
  }
}
