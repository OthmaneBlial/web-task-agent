import type {
  AgentPageDigest,
  AgentPlan,
  AgentResearchContentType,
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
const AVERAGE_QUICK_SKIP_MS = Math.round((QUICK_SKIP_MIN_MS + QUICK_SKIP_MAX_MS) / 2);

export function nowIso(): string {
  return new Date().toISOString();
}

export function addSecondsToIso(input: string, seconds: number): string {
  return new Date(Date.parse(input) + seconds * 1000).toISOString();
}

export function addHoursToIso(input: string, hours: number): string {
  return addSecondsToIso(input, Math.round(hours * 60 * 60));
}

export function computeElapsedMinutes(startedAt: string, endedAt: string): number {
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) {
    return 0;
  }

  return Math.max(0, Math.round((endedMs - startedMs) / 60_000));
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

function titleSnippetHaystack(result: Pick<AgentSearchResult, "title" | "snippet">): string {
  return [result.title, result.snippet].join(" ").toLowerCase();
}

function pageHaystack(page?: AgentPageDigest): string {
  if (!page) {
    return "";
  }

  return [
    page.title,
    page.description,
    page.h1 ?? "",
    ...page.headings,
    ...page.paragraphs
  ]
    .join(" ")
    .toLowerCase();
}

export function classifyResearchContentType(
  result: Pick<AgentSearchResult, "title" | "url" | "snippet" | "site" | "page">
): AgentResearchContentType {
  const hostname = hostnameOf(result.url) || result.site.toLowerCase();
  const pathname = pathnameOf(result.url);
  const haystack = `${titleSnippetHaystack(result)} ${pageHaystack(result.page)}`;

  if (
    hostname.startsWith("docs.") ||
    hostname.startsWith("developer.") ||
    pathname.includes("/docs/") ||
    pathname.includes("/guide") ||
    pathname.includes("/guides/") ||
    pathname.includes("/reference") ||
    pathname.includes("/api/") ||
    pathname.includes("/sdk") ||
    pathname.includes("/manual") ||
    haystack.includes("developer guide") ||
    haystack.includes("api reference")
  ) {
    return "documentation";
  }

  if (
    hostname.includes("reddit.com") ||
    hostname.includes("discourse") ||
    hostname.includes("forum.") ||
    hostname.includes("community.") ||
    hostname.includes("news.ycombinator.com") ||
    hostname.includes("stackoverflow.com") ||
    pathname.includes("/forum/") ||
    pathname.includes("/community/") ||
    pathname.includes("/discussion") ||
    pathname.includes("/discussions/") ||
    pathname.includes("/issues/") ||
    pathname.includes("/comments/") ||
    haystack.includes("community thread") ||
    haystack.includes("discussion thread")
  ) {
    return "forum";
  }

  if (
    hostname.includes("g2.com") ||
    hostname.includes("capterra.com") ||
    hostname.includes("trustpilot.com") ||
    hostname.includes("play.google.com") ||
    hostname.includes("apps.apple.com") ||
    pathname.includes("/review") ||
    pathname.includes("/reviews/") ||
    pathname.includes("/ratings") ||
    haystack.includes("pros and cons") ||
    haystack.includes("what users say") ||
    haystack.includes("user review") ||
    haystack.includes("customer review")
  ) {
    return "review";
  }

  return "general";
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
    hostname === "duckduckgo.com" &&
    (pathname === "/y.js" ||
      result.url.includes("ad_provider=") ||
      result.url.includes("ad_domain=") ||
      result.url.includes("click_metadata="))
  ) {
    signals.push("search ad redirect");
    return {
      action: "skip",
      reason: "blocked by domain policy: search ad redirect",
      signals
    };
  }

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

export function scoreSearchResultPriority(
  result: AgentSearchResult,
  rankHint: number = 0
): {
  score: number;
  signals: string[];
  contentType: AgentResearchContentType;
  policy: AgentDomainPolicyDecision;
} {
  const policy = evaluateDomainPolicy(result);
  const hostname = hostnameOf(result.url);
  const pathname = pathnameOf(result.url);
  const contentType = result.contentType ?? classifyResearchContentType(result);
  const scoreSignals = [`content type: ${contentType}`];
  let score = 0.4;

  if (policy.action === "allow") {
    score += 0.12;
    scoreSignals.push("policy allow");
  } else if (policy.action === "deprioritize") {
    score -= 0.14;
    scoreSignals.push("policy deprioritize");
  } else {
    score -= 0.42;
    scoreSignals.push("policy skip");
  }

  if (contentType === "documentation") {
    score += 0.2;
    scoreSignals.push("documentation source");
  } else if (contentType === "forum") {
    score += 0.13;
    scoreSignals.push("community discussion");
  } else if (contentType === "review") {
    score += 0.11;
    scoreSignals.push("review signal");
  }

  if (
    hostname?.endsWith(".gov") ||
    hostname?.endsWith(".edu") ||
    hostname === "github.com"
  ) {
    score += 0.08;
    scoreSignals.push("high-trust host");
  }

  if ((result.snippet ?? "").length >= 100) {
    score += 0.06;
    scoreSignals.push("strong snippet");
  } else if ((result.snippet ?? "").length >= 50) {
    score += 0.03;
    scoreSignals.push("usable snippet");
  }

  if ((result.title ?? "").length >= 24) {
    score += 0.02;
    scoreSignals.push("descriptive title");
  }

  if (pathname.includes("/pricing") || pathname.includes("/careers") || pathname.includes("/press")) {
    score -= 0.16;
    scoreSignals.push("low-research-intent path");
  }

  if (
    pathname.includes("/tag/") ||
    pathname.includes("/category/") ||
    pathname.includes("/archive") ||
    pathname.includes("/search")
  ) {
    score -= 0.14;
    scoreSignals.push("index-like result");
  }

  if (typeof result.qualityScore === "number") {
    score += (result.qualityScore - 0.5) * 0.24;
    scoreSignals.push("quality-informed score");
  }

  if (result.reviewStatus === "read") {
    score += 0.06;
    scoreSignals.push("already reviewed");
  } else if (result.reviewStatus === "skipped") {
    score -= 0.1;
    scoreSignals.push("previously skipped");
  } else if (result.reviewStatus === "error") {
    score -= 0.18;
    scoreSignals.push("previous fetch error");
  }

  score += Math.max(0, 0.09 - rankHint * 0.01);
  scoreSignals.push(`search rank bias ${rankHint + 1}`);

  return {
    score: clamp(score, 0, 1),
    signals: Array.from(new Set([...policy.signals, ...scoreSignals])),
    contentType,
    policy
  };
}

export function rankSearchResults(results: AgentSearchResult[]): AgentSearchResult[] {
  return results
    .map((result, index) => {
      const priority = scoreSearchResultPriority(result, index);
      return {
        ...result,
        contentType: priority.contentType,
        policyAction: result.policyAction ?? priority.policy.action,
        policyReason: result.policyReason ?? priority.policy.reason,
        rankingScore: Number(priority.score.toFixed(2)),
        rankingSignals: priority.signals
      };
    })
    .sort((left, right) => {
      const rightScore = right.rankingScore ?? 0;
      const leftScore = left.rankingScore ?? 0;

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return left.title.localeCompare(right.title);
    });
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
  const expectedFetchedResultsPerQuery = clamp(
    Math.round(Math.min(maxResultsPerQuery, Math.max(6, maxResultsPerQuery * 0.25))),
    4,
    12
  );
  const expectedReadResultsPerQuery = Math.max(1, Math.round(expectedFetchedResultsPerQuery * 0.65));
  const expectedQuickSkipsPerQuery = Math.max(0, expectedFetchedResultsPerQuery - expectedReadResultsPerQuery);
  const expectedSearchScansPerQuery = Math.max(1, Math.min(3, Math.ceil(maxResultsPerQuery / 15)));
  const researchMs =
    queries * expectedSearchScansPerQuery * AVERAGE_QUERY_SCAN_MS +
    queries * expectedReadResultsPerQuery * AVERAGE_ARTICLE_READ_MS +
    queries * expectedQuickSkipsPerQuery * AVERAGE_QUICK_SKIP_MS +
    queries * 2_000;
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
