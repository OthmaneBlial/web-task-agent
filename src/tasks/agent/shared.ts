import type {
  AgentPageDigest,
  AgentPlan,
  AgentSearchResult,
  AgentResearchResult
} from "../../types";

export const DUCKDUCKGO_SEARCH_PROVIDER = "duckduckgo_html";
export const QUERY_SCAN_MIN_MS = 4_000;
export const QUERY_SCAN_MAX_MS = 8_000;
export const ARTICLE_READ_MIN_MS = 10_000;
export const ARTICLE_READ_MAX_MS = 20_000;
export const QUICK_SKIP_MIN_MS = 700;
export const QUICK_SKIP_MAX_MS = 1_800;
export const MAX_ARTICLES_PER_QUERY = 3;
export const DEFAULT_AGENT_MAX_RUNTIME_HOURS = 6;
export const DEFAULT_JOB_LEASE_TTL_SECONDS = 15 * 60;
export const DEFAULT_JOB_HEARTBEAT_INTERVAL_SECONDS = 60;
export const MAX_AGENT_QUERIES = 25;
export const MAX_AGENT_RESULTS_PER_QUERY = 100;
export const DEFAULT_FETCH_BATCH_SIZE = 5;
export const MAX_FETCH_BATCH_SIZE = 20;

export interface AgentDomainPolicyDecision {
  action: "allow" | "skip" | "deprioritize";
  reason: string;
  signals: string[];
}

export interface AgentDocumentQualityAssessment {
  readable: boolean;
  score: number;
  reason: string;
  signals: string[];
}

const AVERAGE_ARTICLE_READ_MS = Math.round((ARTICLE_READ_MIN_MS + ARTICLE_READ_MAX_MS) / 2);
const AVERAGE_QUERY_SCAN_MS = Math.round((QUERY_SCAN_MIN_MS + QUERY_SCAN_MAX_MS) / 2);

export function nowIso(): string {
  return new Date().toISOString();
}

export function addSecondsToIso(input: string, seconds: number): string {
  return new Date(Date.parse(input) + seconds * 1000).toISOString();
}

export function addHoursToIso(input: string, hours: number): string {
  return addSecondsToIso(input, Math.round(hours * 60 * 60));
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "item";
}

export function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

export function randomInt(min: number, max: number): number {
  return Math.round(randomBetween(min, max));
}

export function clamp(value: number, min: number, max: number): number {
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

function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function pathnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).pathname.toLowerCase();
  } catch {
    return "";
  }
}

export function looksLikeErrorPage(page: AgentPageDigest): boolean {
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

export function evaluateDomainPolicy(result: AgentSearchResult): AgentDomainPolicyDecision {
  const hostname = hostnameOf(result.url);
  const pathname = pathnameOf(result.url);
  const title = [result.title, result.snippet].join(" ").toLowerCase();
  const signals: string[] = [];

  if (
    hostname === "x.com" ||
    hostname.endsWith(".x.com") ||
    hostname.includes("facebook.com") ||
    hostname.includes("instagram.com") ||
    hostname.includes("tiktok.com") ||
    hostname.includes("linkedin.com") ||
    hostname.includes("youtube.com") ||
    hostname === "youtu.be"
  ) {
    signals.push("social or video domain");
    return {
      action: "skip",
      reason: "blocked by domain policy: social or video domain",
      signals
    };
  }

  if (
    pathname.includes("/login") ||
    pathname.includes("/signin") ||
    pathname.includes("/sign-in") ||
    pathname.includes("/signup") ||
    pathname.includes("/sign-up") ||
    pathname.includes("/auth") ||
    pathname.includes("/account")
  ) {
    signals.push("auth path");
    return {
      action: "skip",
      reason: "blocked by domain policy: auth or account page",
      signals
    };
  }

  if (
    pathname.includes("/search") ||
    pathname.includes("/tag/") ||
    pathname.includes("/tags/") ||
    pathname.includes("/category/") ||
    pathname.includes("/categories/") ||
    pathname.includes("/archive")
  ) {
    signals.push("index-like path");
    return {
      action: "deprioritize",
      reason: "domain policy: index-like page",
      signals
    };
  }

  if (hostname.startsWith("docs.") || hostname.startsWith("developer.")) {
    signals.push("documentation domain");
    return {
      action: "allow",
      reason: "documentation source",
      signals
    };
  }

  if (
    hostname === "reddit.com" ||
    hostname.endsWith(".reddit.com") ||
    hostname === "github.com" ||
    hostname.endsWith(".gov") ||
    hostname.endsWith(".edu")
  ) {
    signals.push("high-signal domain");
    return {
      action: "allow",
      reason: "high-signal domain",
      signals
    };
  }

  if (title.includes("pricing") || title.includes("careers") || title.includes("press release")) {
    signals.push("low-research-intent title");
    return {
      action: "deprioritize",
      reason: "domain policy: low-research-intent page",
      signals
    };
  }

  return {
    action: "allow",
    reason: "general web page",
    signals
  };
}

export function isReadablePage(page: AgentPageDigest): boolean {
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

export function assessDocumentQuality(
  result: Pick<AgentSearchResult, "title" | "url" | "snippet">,
  page: AgentPageDigest
): AgentDocumentQualityAssessment {
  const policy = evaluateDomainPolicy({
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    site: ""
  });
  const scoreSignals = [...policy.signals];

  if (looksLikeErrorPage(page)) {
    return {
      readable: false,
      score: 0.05,
      reason: "error-like page",
      signals: [...scoreSignals, "error-like page"]
    };
  }

  const titleHaystack = [page.title, page.h1 ?? "", ...page.headings].join(" ").toLowerCase();
  const contentLength = pageContentLength(page);
  const uniqueParagraphs = Array.from(
    new Set(page.paragraphs.map((paragraph) => paragraph.toLowerCase().trim()))
  );
  let score = 0.35;

  if (policy.action === "deprioritize") {
    score -= 0.12;
    scoreSignals.push("policy deprioritized");
  }

  if (page.h1) {
    score += 0.12;
    scoreSignals.push("has h1");
  }
  if ((page.description ?? "").length >= 90) {
    score += 0.08;
    scoreSignals.push("strong description");
  }
  if (page.headings.length >= 2) {
    score += 0.08;
    scoreSignals.push("multiple headings");
  }
  if (page.paragraphs.length >= 2) {
    score += 0.14;
    scoreSignals.push("multiple paragraphs");
  }
  if (contentLength >= 480) {
    score += 0.16;
    scoreSignals.push("longer textual content");
  } else if (contentLength >= 320) {
    score += 0.08;
    scoreSignals.push("adequate textual content");
  } else {
    score -= 0.16;
    scoreSignals.push("thin textual content");
  }
  if (uniqueParagraphs.length < page.paragraphs.length) {
    score -= 0.08;
    scoreSignals.push("repeated paragraph content");
  }
  if (
    titleHaystack.includes("search results") ||
    titleHaystack.includes("all posts") ||
    titleHaystack.includes("tag:") ||
    titleHaystack.includes("category:") ||
    titleHaystack.includes("archive")
  ) {
    score -= 0.18;
    scoreSignals.push("index-like heading");
  }

  const clampedScore = clamp(Number(score.toFixed(2)), 0, 1);
  if (!isReadablePage(page) || clampedScore < 0.45) {
    return {
      readable: false,
      score: clampedScore,
      reason:
        clampedScore < 0.25
          ? "low-quality page"
          : titleHaystack.includes("archive") || titleHaystack.includes("category:")
            ? "index-like page"
            : "thin content",
      signals: scoreSignals
    };
  }

  return {
    readable: true,
    score: clampedScore,
    reason: "readable page",
    signals: scoreSignals
  };
}

export function estimateArticleReadMs(page: AgentPageDigest): number {
  const richness = clamp((pageContentLength(page) - 220) / 1_600, 0, 1);
  const estimated =
    ARTICLE_READ_MIN_MS + richness * (ARTICLE_READ_MAX_MS - ARTICLE_READ_MIN_MS) + randomBetween(-4_000, 4_000);
  return clamp(Math.round(estimated), ARTICLE_READ_MIN_MS, ARTICLE_READ_MAX_MS);
}

export function computeExecutionEstimateMinutes(plan: AgentPlan, maxResultsPerQuery: number): number {
  const queries = plan.researchQueries.length;
  const visitedArticlesPerQuery = Math.max(1, maxResultsPerQuery);
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

export function countCapturedResearchSources(research: AgentResearchResult[]): number {
  return research.reduce((total, entry) => total + entry.results.length, 0);
}

export function countCapturedResearchDocuments(research: AgentResearchResult[]): number {
  return research.reduce(
    (total, entry) => total + entry.results.filter((result) => Boolean(result.page)).length,
    0
  );
}
