export type CDPClient = any;

export interface PageTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface LocatedElement {
  status: "ok" | "not_found" | "ambiguous" | "invalid_selector";
  query: string;
  x?: number;
  y?: number;
  label?: string;
  href?: string;
  bbox?: BoundingBox;
  disabled?: boolean;
  count?: number;
  matches?: string[];
  reason?: string;
}

export interface WaitForSelectorOptions {
  timeoutMs?: number;
  pollMs?: number;
}

export interface NetworkIdleOptions {
  idleTimeMs?: number;
  timeoutMs?: number;
  maxInflightRequests?: number;
}

export interface GitHubRepo {
  key: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string;
  tags: string[];
  language: string | null;
  stars: number | null;
  page: number;
  sourceUrl: string;
  scrapedAt: string;
}

export interface GitHubPageSnapshot {
  page: number;
  url: string;
  nextPageUrl: string | null;
  scrapedAt: string;
  repos: GitHubRepo[];
}

export interface ScoredRepo extends GitHubRepo {
  score: number;
  reasoning: string;
}

export interface GitHubScannerOptions {
  url: string;
  pages: number;
  criteria: string;
  resume: boolean;
  cachePath?: string;
  cacheDir?: string;
  reportPath?: string;
}

export interface GitHubScannerState {
  task: "github";
  runId: string;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  input: {
    url: string;
    maxPages: number;
    criteria: string;
  };
  completedPages: number;
  lastPageUrl: string | null;
  nextPageUrl: string | null;
  pages: GitHubPageSnapshot[];
  repos: GitHubRepo[];
  reportPath: string;
}

export interface PlayStoreAppSummary {
  key: string;
  appId: string | null;
  name: string;
  developer: string;
  rating: number | null;
  ratingCount: string | null;
  url: string;
  iconUrl: string | null;
}

export interface PlayStoreAppDetail extends PlayStoreAppSummary {
  description: string;
  categories: string[];
  reviewSummaries: string[];
  scrapedAt: string;
}

export interface PlayStoreAnalyzerOptions {
  query: string;
  analyzeTop: number;
  resume: boolean;
  cachePath?: string;
  cacheDir?: string;
  reportPath?: string;
}

export interface PlayStoreAnalyzerState {
  task: "playstore";
  runId: string;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed";
  input: {
    query: string;
    analyzeTop: number;
  };
  searchUrl: string;
  summaries: PlayStoreAppSummary[];
  analyzedApps: PlayStoreAppDetail[];
  reportPath: string;
}

export interface MarketInsightReport {
  keyword: string;
  analyzedAt: string;
  executiveSummary: string;
  commonFeatures: string[];
  missingFeatures: string[];
  averageSentiment: string;
  competitorPositioning: string[];
  standoutApps: string[];
}

export interface CacheEnvelope<T> {
  version: number;
  task: string;
  runId: string;
  savedAt: string;
  state: T;
}
