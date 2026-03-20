export type CDPClient = any;

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

export type JobTaskType = "github" | "playstore" | "agent";

export type JobLifecycleStatus = "planning" | "running" | "waiting_review" | "completed" | "failed";

export type JobStepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface JobStepDefinition {
  stepKey: string;
  title: string;
  kind: string;
  position: number;
  input?: unknown;
}

export interface TaskJobInfo {
  jobId: string;
  databasePath: string;
}

export type AgentJobStatus = JobLifecycleStatus;

export type AgentStepStatus = JobStepStatus;

export type AgentStepKind =
  | "research"
  | "draft_post"
  | "draft_comments"
  | "review"
  | "report";

export interface AgentPlanStep {
  id: string;
  kind: AgentStepKind;
  title: string;
  goal: string;
  status: AgentStepStatus;
}

export interface AgentPlan {
  summary: string;
  tone: string;
  estimatedMinutes: number;
  approvalRequired: boolean;
  deliverables: string[];
  researchQueries: string[];
  steps: AgentPlanStep[];
}

export interface AgentPageDigest {
  title: string;
  url: string;
  description: string;
  h1: string | null;
  headings: string[];
  paragraphs: string[];
  capturedAt: string;
}

export interface AgentSearchResult {
  title: string;
  url: string;
  snippet: string;
  site: string;
  page?: AgentPageDigest;
  reviewStatus?: "read" | "skipped" | "error";
  dwellSeconds?: number;
  skipReason?: string;
}

export interface AgentResearchResult {
  query: string;
  searchedAt: string;
  results: AgentSearchResult[];
  error?: string;
}

export interface AgentResearchSummary {
  executiveSummary: string;
  keyFindings: string[];
  contentAngles: string[];
}

export interface AgentEvidenceQuery {
  query: string;
  searchedAt: string;
  status: "completed" | "failed" | "empty";
  resultCount: number;
  error?: string;
  searchProvider: string;
}

export interface AgentEvidenceExtraction {
  sourceId: string;
  documentId: string | null;
  kind: "entity" | "theme" | "complaint" | "feature_request" | "claim";
  value: string;
  evidenceText: string | null;
  confidence: number;
  method: string;
}

export interface AgentEvidenceSource {
  query: string;
  queryStatus: AgentEvidenceQuery["status"];
  rank: number;
  sourceId: string;
  documentId: string | null;
  title: string;
  url: string;
  canonicalUrl: string;
  site: string;
  snippet: string;
  reviewStatus?: "read" | "skipped" | "error";
  dwellSeconds?: number;
  skipReason?: string;
  pageTitle?: string;
  description?: string;
  headings: string[];
  paragraphs: string[];
  extractions: AgentEvidenceExtraction[];
}

export interface AgentEvidenceHighlights {
  entities: string[];
  themes: string[];
  complaints: string[];
  featureRequests: string[];
  claims: string[];
}

export interface AgentEvidenceBundle {
  counts: {
    queries: number;
    sources: number;
    documents: number;
    extractions: number;
  };
  queries: AgentEvidenceQuery[];
  sources: AgentEvidenceSource[];
  highlights: AgentEvidenceHighlights;
}

export interface AgentPostDraft {
  headline: string;
  body: string;
  callToAction: string;
}

export interface AgentCommentsDraft {
  comments: string[];
}

export interface AgentRunOptions {
  instruction: string;
  resume: boolean;
  cachePath?: string;
  cacheDir?: string;
  reportPath?: string;
  memoryPath?: string;
  maxQueries?: number;
  maxResultsPerQuery?: number;
}

export interface AgentRunState {
  task: "agent";
  runId: string;
  startedAt: string;
  updatedAt: string;
  status: AgentJobStatus;
  input: {
    instruction: string;
    memoryPath: string | null;
    maxQueries: number;
    maxResultsPerQuery: number;
  };
  reportPath: string;
  artifactDir: string;
  plan: AgentPlan | null;
  research: AgentResearchResult[];
  researchSummary: AgentResearchSummary | null;
  outputs: {
    planPath: string | null;
    researchSummaryPath: string | null;
    postDraftPath: string | null;
    commentsDraftPath: string | null;
  };
  notes: string[];
}

export interface CacheEnvelope<T> {
  version: number;
  task: string;
  runId: string;
  savedAt: string;
  state: T;
}
