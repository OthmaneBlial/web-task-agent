import fs from "node:fs";
import path from "node:path";

import { JobStore } from "../../lib/job-store";
import { LlmService } from "../../lib/llm";
import type {
  AgentEvidenceBundle,
  AgentResearchResult,
  AgentResearchSummary,
  AgentSearchResult,
  AgentRunState
} from "../../types";
import { parseDirectAppId } from "./direct-source";
import { computeElapsedMinutes, nowIso } from "./shared";

function readIfExists(filePath: string | null): string | null {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function isTerminalStatus(status: AgentRunState["status"]): boolean {
  return (
    status === "waiting_review" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "paused"
  );
}

function formatMinutes(minutes: number): string {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

const ASO_STOP_WORDS = new Set([
  "android",
  "app",
  "apps",
  "best",
  "build",
  "builder",
  "create",
  "download",
  "editor",
  "fast",
  "for",
  "free",
  "from",
  "google",
  "maker",
  "offline",
  "online",
  "play",
  "private",
  "professional",
  "signup",
  "store",
  "the",
  "with",
  "your"
]);

function uniqueStrings(values: string[], limit?: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (typeof limit === "number" && output.length >= limit) {
      break;
    }
  }

  return output;
}

function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function extractMeaningfulWords(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3)
    .filter((word) => /[a-z]/i.test(word))
    .filter((word) => !ASO_STOP_WORDS.has(word));
}

function titleCasePhrase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeWordStem(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
}

function findDirectAppSeedResult(state: AgentRunState): AgentSearchResult | null {
  for (const entry of state.research) {
    if (!entry.query.startsWith("Provided source: ")) {
      continue;
    }
    const result = entry.results[0];
    if (result && parseDirectAppId(result.url)) {
      return result;
    }
  }

  return null;
}

function findDirectAppBenchmarkResults(state: AgentRunState): AgentResearchResult[] {
  return state.research.filter((entry) => entry.query.startsWith("Play Store benchmark: "));
}

function parseDirectAppRank(value: string): number | null {
  const match = value.match(/rank #(\d+)/i);
  if (!match) {
    return null;
  }

  const rank = Number(match[1]);
  return Number.isFinite(rank) ? rank : null;
}

function deriveAsoCurrentListing(seed: AgentSearchResult): {
  title: string;
  shortDescription: string;
  longDescription: string;
  category: string | null;
  developer: string | null;
  appId: string | null;
} {
  const headings = (seed.page?.headings ?? []).filter(
    (heading) => !/^about this app$/i.test(heading) && !/^current aso audit$/i.test(heading)
  );
  const paragraphs = seed.page?.paragraphs ?? [];
  const shortDescription = seed.page?.description || seed.snippet || "";
  const longDescription =
    paragraphs.find(
      (paragraph) =>
        paragraph !== shortDescription &&
        !/^Current short description:/i.test(paragraph) &&
        !/^Primary title keywords detected/i.test(paragraph) &&
        !/^Category:/i.test(paragraph)
    ) ?? "";

  return {
    title: seed.page?.h1 || seed.title,
    shortDescription,
    longDescription,
    category: headings[0] ?? null,
    developer: headings[1] ?? null,
    appId: parseDirectAppId(seed.url)
  };
}

function derivePrimaryBenchmarkKeyword(benchmarks: AgentResearchResult[], fallbackTitle: string): string {
  const firstBenchmark = benchmarks[0]?.query.match(/^Play Store benchmark:\s*(.+)$/i)?.[1]?.trim();
  if (firstBenchmark) {
    return firstBenchmark;
  }

  const words = extractMeaningfulWords(fallbackTitle).slice(0, 2);
  return words.join(" ") || fallbackTitle.toLowerCase();
}

function buildCompetitorTokenSummary(
  listing: ReturnType<typeof deriveAsoCurrentListing>,
  competitors: AgentSearchResult[]
): string[] {
  const currentTokens = new Set(
    extractMeaningfulWords(`${listing.title} ${listing.shortDescription}`).map(normalizeWordStem)
  );
  const counts = new Map<string, number>();

  for (const competitor of competitors) {
    const fields = [competitor.title, competitor.snippet, competitor.page?.description ?? ""];
    for (const token of uniqueStrings(fields.flatMap((field) => extractMeaningfulWords(field)))) {
      if (currentTokens.has(normalizeWordStem(token))) {
        continue;
      }
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([token]) => token);
}

function buildAsoTitleProposal(primaryKeyword: string, listing: ReturnType<typeof deriveAsoCurrentListing>): string {
  const base = titleCasePhrase(primaryKeyword);
  const primaryTokens = new Set(extractMeaningfulWords(primaryKeyword).map(normalizeWordStem));
  const descriptorWords = extractMeaningfulWords(listing.shortDescription)
    .filter((word) => !primaryTokens.has(normalizeWordStem(word)))
    .slice(0, 2)
    .map((word) => titleCasePhrase(word));
  const variants = [
    `${base}: ${descriptorWords.join(" ")}`.trim().replace(/:\s*$/, ""),
    `${base} ${descriptorWords.join(" ")}`.trim(),
    base
  ];

  return (
    variants.find((variant) => variant.length >= 8 && variant.length <= 30) ??
    variants.find((variant) => variant.length >= 8) ??
    listing.title
  );
}

function buildAsoShortDescriptionProposal(
  primaryKeyword: string,
  listing: ReturnType<typeof deriveAsoCurrentListing>,
  missingTerms: string[]
): string {
  const primaryTokens = new Set(extractMeaningfulWords(primaryKeyword).map(normalizeWordStem));
  const differentiator = uniqueStrings(
    [
      ...extractMeaningfulWords(listing.shortDescription).filter(
        (word) => !primaryTokens.has(normalizeWordStem(word))
      ),
      ...missingTerms
    ],
    3
  )
    .slice(0, 3)
    .join(", ");

  const candidate = differentiator
    ? `Create ${primaryKeyword} faster with ${differentiator} and clearer mobile workflows.`
    : `Create ${primaryKeyword} faster with a clearer mobile workflow and stronger value messaging.`;

  return candidate.length <= 80 ? candidate : `${candidate.slice(0, 77).trimEnd()}.`;
}

function renderAsoAuditSection(state: AgentRunState): string {
  const seed = findDirectAppSeedResult(state);
  if (!seed?.page) {
    return "";
  }

  const benchmarks = findDirectAppBenchmarkResults(state);
  if (benchmarks.length === 0) {
    return "";
  }

  const listing = deriveAsoCurrentListing(seed);
  const benchmarkSummaries = uniqueStrings(
    benchmarks.flatMap((benchmark) => benchmark.results[0]?.page?.paragraphs.slice(0, 2) ?? [benchmark.results[0]?.snippet ?? ""]),
    6
  );
  const competitors = uniqueStrings(
    benchmarks
      .flatMap((benchmark) => benchmark.results.slice(1))
      .map((result) => result.title),
    6
  );
  const competitorResults = benchmarks.flatMap((benchmark) => benchmark.results.slice(1));
  const missingTerms = buildCompetitorTokenSummary(listing, competitorResults);
  const primaryKeyword = derivePrimaryBenchmarkKeyword(benchmarks, listing.title);
  const topRank =
    benchmarkSummaries
      .map(parseDirectAppRank)
      .find((rank): rank is number => typeof rank === "number") ?? null;
  const proposalTitle = buildAsoTitleProposal(primaryKeyword, listing);
  const proposalShortDescription = buildAsoShortDescriptionProposal(
    primaryKeyword,
    listing,
    missingTerms
  );
  const competitorGapNotes = uniqueStrings(
    [
      topRank && topRank > 10
        ? `The app is buried at roughly rank #${topRank} for its main visible keyword, which usually means the listing is not matching the terms users search first.`
        : topRank
          ? `The app is visible around rank #${topRank}, so the title and description still need stronger differentiation against nearby competitors.`
          : "",
      missingTerms.length > 0
        ? `Top competitors repeatedly surface terms like ${missingTerms.join(", ")}, while the current listing underuses those demand signals.`
        : "",
      competitors.length > 0
        ? `The current market leaders around this keyword include ${competitors.slice(0, 4).join(", ")}.`
        : "",
      listing.shortDescription.length < 55
        ? "The current short description is concise, but it leaves ranking and conversion room on the table because it does not stack enough concrete search intent and benefit language."
        : ""
    ].filter(Boolean),
    4
  );

  const lines = ["## ASO Audit", "", "### Current Listing", ""];
  lines.push(`- Title: ${listing.title}`);
  lines.push(`- Short Description: ${listing.shortDescription || "n/a"}`);
  if (listing.category) {
    lines.push(`- Category: ${listing.category}`);
  }
  if (listing.developer) {
    lines.push(`- Developer: ${listing.developer}`);
  }
  if (listing.appId) {
    lines.push(`- Package ID: ${listing.appId}`);
  }
  if (safeHostname(seed.url).includes("appbrain.com")) {
    lines.push("- Input Source: AppBrain URL provided; listing metadata was normalized from Google Play because AppBrain pages can be verification-protected during automated runs.");
  }
  if (listing.longDescription) {
    lines.push(`- Listing Angle: ${listing.longDescription}`);
  }

  lines.push("", "### Keyword Visibility", "");
  for (const summary of benchmarkSummaries.slice(0, 4)) {
    lines.push(`- ${summary}`);
  }

  lines.push("", "### Competitor Gap Analysis", "");
  for (const note of competitorGapNotes) {
    lines.push(`- ${note}`);
  }

  lines.push("", "### Rewritten ASO Proposal", "");
  lines.push(`- Proposed Title: ${proposalTitle}`);
  lines.push(`- Proposed Short Description: ${proposalShortDescription}`);
  lines.push(
    `- Positioning Direction: Lead with "${titleCasePhrase(primaryKeyword)}" first, then emphasize the clearest differentiator from the current listing instead of generic filler language.`
  );
  if (missingTerms.length > 0) {
    lines.push(`- Terms To Test: ${missingTerms.join(", ")}`);
  }
  lines.push("");

  return lines.join("\n");
}

function buildEvidenceLabelMap(
  summary: AgentResearchSummary,
  evidence?: AgentEvidenceBundle | null
): Map<string, string> {
  const labels = new Map<string, string>();
  let extractionIndex = 1;
  let sourceIndex = 1;
  let fallbackIndex = 1;

  const register = (id: string) => {
    if (!id || labels.has(id)) {
      return;
    }

    if (id.startsWith("ext_")) {
      labels.set(id, `E${extractionIndex}`);
      extractionIndex += 1;
      return;
    }

    if (id.startsWith("src_")) {
      labels.set(id, `S${sourceIndex}`);
      sourceIndex += 1;
      return;
    }

    labels.set(id, `R${fallbackIndex}`);
    fallbackIndex += 1;
  };

  for (const source of evidence?.sources ?? []) {
    register(source.sourceId);
    for (const extraction of source.extractions) {
      register(extraction.id);
    }
  }

  for (const reference of summary.referencedEvidence ?? []) {
    register(reference.id);
  }

  return labels;
}

function formatEvidenceRefs(ids: string[], labels: Map<string, string>, limit: number = 6): string[] {
  const display = ids
    .map((id) => labels.get(id))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(display)).sort((left, right) => left.localeCompare(right)).slice(0, limit);
}

function derivePlanLines(state: AgentRunState): string[] {
  const plan = state.plan;
  if (!plan) {
    return [];
  }

  const researchDone =
    plan.researchQueries.length === 0 ||
    (state.pipeline.workItems.length > 0 &&
      state.pipeline.workItems.every((item) => item.nextStage === "completed"));

  return plan.steps.map((step, index) => {
    let status = step.status;

    if (step.kind === "research" && researchDone && state.status !== "failed") {
      status = "completed";
    } else if (step.kind === "report" && (state.status === "waiting_review" || state.status === "completed")) {
      status = "completed";
    } else if (step.kind === "review") {
      if (state.status === "waiting_review") {
        status = "pending";
      } else if (state.status === "completed") {
        status = "completed";
      } else if (state.status === "cancelled" || state.status === "failed") {
        status = "skipped";
      }
    }

    return `${index + 1}. ${step.title} [${step.kind}] - ${status}`;
  });
}

function assessRunQuality(
  state: AgentRunState,
  evidence?: AgentEvidenceBundle | null
): {
  score: number;
  label: string;
  notes: string[];
} | null {
  if (!evidence || evidence.counts.sources === 0) {
    return null;
  }

  const results = state.research.flatMap((entry) => entry.results);
  const visited = results.filter((result) => Boolean(result.reviewStatus)).length;
  const read = results.filter((result) => result.reviewStatus === "read").length;
  const errors = results.filter((result) => result.reviewStatus === "error").length;
  const highSignalSources = evidence.sources.filter((source) => source.overallScore >= 0.7).length;
  const averageSourceScore =
    evidence.sources.reduce((total, source) => total + source.overallScore, 0) /
    Math.max(1, evidence.sources.length);
  const fetchReliability = visited > 0 ? 1 - errors / visited : 0.7;
  const readRatio = visited > 0 ? read / visited : 0.6;
  const documentCoverage = Math.min(1, evidence.counts.documents / 24);
  const extractionDepth = Math.min(1, evidence.counts.extractions / 180);
  const highSignalRatio = highSignalSources / Math.max(1, evidence.sources.length);

  const score = Math.max(
    0,
    Math.min(
      10,
      Number(
        (
          documentCoverage * 2.1 +
          extractionDepth * 1.9 +
          averageSourceScore * 2.1 +
          highSignalRatio * 1.4 +
          fetchReliability * 1.4 +
          readRatio * 1.1
        ).toFixed(1)
      )
    )
  );

  const label =
    score >= 8.5 ? "strong" : score >= 7 ? "good" : score >= 5.5 ? "usable" : "thin";

  return {
    score,
    label,
    notes: [
      `${evidence.counts.documents} readable documents captured from ${evidence.counts.sources} discovered sources`,
      `${highSignalSources} sources scored at or above 70% overall quality`,
      visited > 0
        ? `${errors} fetch errors across ${visited} visited results`
        : "No fetched result telemetry was recorded"
    ]
  };
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

function renderEvidenceDebugSection(evidence: AgentEvidenceBundle): string {
  if (evidence.sources.length === 0) {
    return "";
  }

  const lines = ["## Evidence Debug", ""];

  for (const source of evidence.sources.slice(0, 6)) {
    lines.push(
      `- [${source.sourceId}] ${source.title} | type ${source.contentType} | quality ${(source.sourceQualityScore * 100).toFixed(0)}% | freshness ${(source.freshnessScore * 100).toFixed(0)}% | trend ${(source.trendScore * 100).toFixed(0)}% | overall ${(source.overallScore * 100).toFixed(0)}%`
    );
    if (source.qualitySignals.length > 0) {
      lines.push(`  Signals: ${source.qualitySignals.slice(0, 4).join(" | ")}`);
    }
    if (source.extractions.length > 0) {
      lines.push(
        `  Extractions: ${source.extractions.slice(0, 3).map((item) => `${item.kind}: ${item.value}`).join(" | ")}`
      );
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderClusterSection(evidence: AgentEvidenceBundle, labels?: Map<string, string>): string {
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
    const refs = labels ? formatEvidenceRefs(cluster.evidenceIds, labels, 4) : [];
    if (refs.length > 0) {
      lines.push(`  Evidence: ${refs.join(", ")}`);
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderContradictionSection(evidence: AgentEvidenceBundle, labels?: Map<string, string>): string {
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
    if (contradiction.leftEvidenceValues.length > 0) {
      lines.push(`  Left evidence: ${contradiction.leftEvidenceValues.slice(0, 3).join(" | ")}`);
    }
    if (contradiction.rightEvidenceValues.length > 0) {
      lines.push(`  Right evidence: ${contradiction.rightEvidenceValues.slice(0, 3).join(" | ")}`);
    }
    if (contradiction.queries.length > 0) {
      lines.push(`  Queries: ${contradiction.queries.slice(0, 3).join(" | ")}`);
    }
    const refs = labels ? formatEvidenceRefs(contradiction.evidenceIds, labels, 6) : [];
    if (refs.length > 0) {
      lines.push(`  Evidence: ${refs.join(", ")}`);
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderSummaryReferenceCatalog(
  summary: AgentResearchSummary,
  evidence?: AgentEvidenceBundle | null
): string {
  const referencedEvidence = summary.referencedEvidence ?? [];
  if (referencedEvidence.length === 0) {
    return "";
  }

  const labels = buildEvidenceLabelMap(summary, evidence);
  const lines = ["### Evidence References", ""];

  const orderedReferences = [...referencedEvidence].sort((left, right) => {
    if (left.sourceTitle !== right.sourceTitle) {
      return left.sourceTitle.localeCompare(right.sourceTitle);
    }
    if (left.sourceUrl !== right.sourceUrl) {
      return left.sourceUrl.localeCompare(right.sourceUrl);
    }
    return left.id.localeCompare(right.id);
  });

  for (const reference of orderedReferences) {
    const confidence =
      typeof reference.confidence === "number" ? ` | confidence ${(reference.confidence * 100).toFixed(0)}%` : "";
    const score =
      typeof reference.overallScore === "number" ? ` | score ${(reference.overallScore * 100).toFixed(0)}%` : "";
    const label = labels.get(reference.id) ?? reference.id;
    lines.push(
      `- [${label}] ${reference.kind} | ${reference.sourceTitle} | ${reference.value}${confidence}${score}`
    );
    lines.push(`  Query: ${reference.query} | URL: ${reference.sourceUrl}`);
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderUncertaintySection(
  summary: AgentResearchSummary,
  evidence?: AgentEvidenceBundle | null,
  labels?: Map<string, string>
): string {
  const explicitUncertainties = summary.uncertainties ?? [];
  const hasExplicitUncertainties = explicitUncertainties.length > 0;
  if (!hasExplicitUncertainties && (!evidence || evidence.contradictions.length === 0)) {
    return "";
  }

  const lines = ["### Uncertainties", ""];

  for (const item of explicitUncertainties.slice(0, 5)) {
    lines.push(`- ${item}`);
  }

  if (evidence) {
    for (const contradiction of evidence.contradictions.slice(0, 5)) {
      lines.push(`- ${contradiction.topic}`);
      lines.push(`  ${contradiction.reason}`);
      const refs = labels ? formatEvidenceRefs(contradiction.evidenceIds, labels, 4) : [];
      if (refs.length > 0) {
        lines.push(`  Evidence: ${refs.join(", ")}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

function renderRecommendationSection(summary: AgentResearchSummary, evidence?: AgentEvidenceBundle | null): string {
  const explicitRecommendations = summary.recommendations ?? [];
  const contentAngleDetails =
    (summary.contentAngleDetails ?? []).length > 0
      ? (summary.contentAngleDetails ?? [])
      : summary.contentAngles.map((text) => ({ text, evidenceIds: [] }));

  if (explicitRecommendations.length === 0 && contentAngleDetails.length === 0) {
    return "";
  }

  const labels = buildEvidenceLabelMap(summary, evidence);
  const lines = ["### Recommendations", ""];

  for (const recommendation of explicitRecommendations.slice(0, 5)) {
    lines.push(`- ${recommendation}`);
  }

  for (const angle of contentAngleDetails.slice(0, 5)) {
    lines.push(`- Focus on: ${angle.text}`);
    const refs = formatEvidenceRefs(angle.evidenceIds, labels);
    if (refs.length > 0) {
      lines.push(`  Evidence: ${refs.join(", ")}`);
    }
  }

  lines.push("");
  return lines.join("\n").trim();
}

export function renderResearchSummary(summary: AgentResearchSummary, evidence?: AgentEvidenceBundle | null): string {
  const labels = buildEvidenceLabelMap(summary, evidence);
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
      const refs = formatEvidenceRefs(finding.evidenceIds, labels);
      if (refs.length > 0) {
        lines.push(`  Evidence: ${refs.join(", ")}`);
      }
    }
    lines.push("");
  }

  if (contentAngleDetails.length > 0) {
    lines.push("### Content Angles", "");
    for (const angle of contentAngleDetails) {
      lines.push(`- ${angle.text}`);
      const refs = formatEvidenceRefs(angle.evidenceIds, labels);
      if (refs.length > 0) {
        lines.push(`  Evidence: ${refs.join(", ")}`);
      }
    }
    lines.push("");
  }

  const recommendationSection = renderRecommendationSection(summary, evidence);
  if (recommendationSection) {
    lines.push(recommendationSection, "");
  }

  if ((summary.uncertainties ?? []).length > 0 || (evidence && evidence.contradictions.length > 0)) {
    const uncertaintySection = renderUncertaintySection(summary, evidence, labels);
    if (uncertaintySection) {
      lines.push(uncertaintySection, "");
    }
  }

  if (evidence && evidence.counts.sources > 0) {
    lines.push(renderEvidenceSection(evidence), "");
  }

  const referenceCatalog = renderSummaryReferenceCatalog(summary, evidence);
  if (referenceCatalog) {
    lines.push(referenceCatalog, "");
  }

  return lines.join("\n").trim();
}

export function renderReport(state: AgentRunState, evidence?: AgentEvidenceBundle | null): string {
  const postDraft = readIfExists(state.outputs.postDraftPath);
  const commentsDraft = readIfExists(state.outputs.commentsDraftPath);
  const planLines = derivePlanLines(state);
  const expectedMinutes = state.plan?.estimatedMinutes ?? null;
  const actualMinutes = isTerminalStatus(state.status)
    ? computeElapsedMinutes(state.startedAt, state.updatedAt)
    : null;
  const quality = assessRunQuality(state, evidence);
  const referenceLabels =
    state.researchSummary || evidence ? buildEvidenceLabelMap(state.researchSummary ?? {
      executiveSummary: "",
      keyFindings: [],
      contentAngles: [],
      keyFindingDetails: [],
      contentAngleDetails: [],
      referencedEvidence: []
    }, evidence) : new Map<string, string>();

  const lines: string[] = [
    "# Agent Job Report",
    "",
    `Generated: ${nowIso()}`,
    `Run ID: ${state.runId}`,
    `Status: ${state.status}`,
    `Instruction: ${state.input.instruction}`,
    `Artifact Directory: ${state.artifactDir}`,
    expectedMinutes !== null ? `Expected Time: ${formatMinutes(expectedMinutes)}` : "Expected Time: unknown",
    actualMinutes !== null ? `Actual Runtime: ${formatMinutes(actualMinutes)}` : undefined,
    quality ? `Run Quality: ${quality.score}/10 (${quality.label})` : undefined,
    "Browsing Policy: 10-20 seconds on readable pages, quick skip on thin/error pages",
    `Memory File: ${state.input.memoryPath ?? "none"}`,
    ""
  ].filter((value): value is string => Boolean(value));

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

  const asoAuditSection = renderAsoAuditSection(state);
  if (asoAuditSection) {
    lines.push(asoAuditSection, "");
  }

  if (quality) {
    lines.push("## Run Quality", "");
    for (const note of quality.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  if (evidence && evidence.sources.length > 0) {
    lines.push(renderEvidenceDebugSection(evidence), "");
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
    lines.push(renderClusterSection(evidence, referenceLabels), "");
  }

  if (evidence && evidence.contradictions.length > 0) {
    lines.push(renderContradictionSection(evidence, referenceLabels), "");
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
    const outputPath =
      state.outputs.researchSummaryPath ?? path.join(state.artifactDir, "handoff", "research-summary.md");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${renderResearchSummary(summary, evidence)}\n`, "utf8");
    state.outputs.researchSummaryPath = outputPath;
    return outputPath;
  }

  writeReportArtifact(state: AgentRunState, jobStore: JobStore): string {
    const evidence = jobStore.getAgentEvidenceBundle();
    fs.mkdirSync(path.dirname(state.reportPath), { recursive: true });
    fs.writeFileSync(state.reportPath, renderReport(state, evidence), "utf8");
    return state.reportPath;
  }
}
