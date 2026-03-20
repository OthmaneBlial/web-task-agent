import type {
  AgentPageDigest,
  AgentPlan,
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
