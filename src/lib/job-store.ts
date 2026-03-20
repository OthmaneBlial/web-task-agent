import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AgentEvidenceBundle,
  AgentEvidenceCluster,
  AgentEvidenceContradiction,
  AgentEvidenceExtraction,
  AgentExtractionCandidate,
  AgentEvidenceQuery,
  AgentEvidenceSource,
  AgentResearchResult,
  AgentSearchResult,
  JobLifecycleStatus,
  JobStepDefinition,
  JobStepStatus,
  JobTaskType
} from "../types";
import { buildHeuristicExtractionCandidates } from "./extraction-heuristics";

const DEFAULT_DATABASE_PATH = path.join(process.cwd(), ".data", "web-task-agent.sqlite");

interface JobStoreOptions {
  jobId: string;
  taskType: JobTaskType;
  workflowName?: string | null;
  title: string;
  instruction?: string | null;
  status: JobLifecycleStatus;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string | null;
  cachePath?: string | null;
  reportPath?: string | null;
  artifactDir?: string | null;
  input?: unknown;
  budget?: unknown;
  output?: unknown;
  errorMessage?: string | null;
  databasePath?: string;
}

interface JobStepRow {
  attempt_count: number;
  started_at: string | null;
}

interface StepWriteOptions {
  status: JobStepStatus;
  output?: unknown;
  errorMessage?: string | null;
  bumpAttempt?: boolean;
  completedAt?: string | null;
}

interface PersistAgentResearchOptions {
  searchProvider?: string;
  searchUrl?: string | null;
  getExtractionCandidates?: (result: AgentSearchResult) => AgentExtractionCandidate[];
}

let sharedDatabase: DatabaseSync | null = null;
let sharedDatabasePath: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeUrl(rawUrl: string): URL | null {
  try {
    return new URL(rawUrl);
  } catch {
    return null;
  }
}

function canonicalizeUrl(rawUrl: string): string {
  const parsed = safeUrl(rawUrl);
  if (!parsed) {
    return rawUrl.trim();
  }

  parsed.hash = "";
  parsed.protocol = parsed.protocol.toLowerCase();
  parsed.hostname = parsed.hostname.toLowerCase();
  const trackingParams = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "gclid",
    "fbclid",
    "msclkid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "ref",
    "ref_src",
    "source"
  ];

  for (const param of trackingParams) {
    parsed.searchParams.delete(param);
  }

  const sortedParams = Array.from(parsed.searchParams.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  );
  parsed.search = "";
  for (const [key, value] of sortedParams) {
    parsed.searchParams.append(key, value);
  }

  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "");
  }

  return parsed.toString();
}

function hostnameOf(rawUrl: string): string | null {
  const parsed = safeUrl(rawUrl);
  return parsed ? parsed.hostname.replace(/^www\./, "") : null;
}

function buildDigestText(result: AgentSearchResult): string {
  const page = result.page;
  if (!page) {
    return normalizeText([result.title, result.snippet].join("\n"));
  }

  return [
    page.title,
    page.description,
    page.h1 ?? "",
    ...page.headings,
    ...page.paragraphs
  ]
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeText(sentence))
    .filter((sentence) => sentence.length >= 20);
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeExtractionValue(value: string): string {
  return normalizeText(value).toLowerCase();
}

function uniqueValues(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = normalizeExtractionValue(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalizeText(value));
    if (output.length >= limit) {
      break;
    }
  }

  return output;
}

const CLUSTER_STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "have",
  "has",
  "had",
  "they",
  "them",
  "their",
  "about",
  "because",
  "would",
  "could",
  "should",
  "more",
  "than",
  "what",
  "when",
  "where",
  "which",
  "users",
  "many",
  "some",
  "current",
  "using",
  "need",
  "needs"
]);

const POLARITY_STOP_WORDS = new Set([
  "support",
  "supports",
  "supported",
  "available",
  "offers",
  "offer",
  "includes",
  "include",
  "included",
  "enables",
  "enable",
  "enabled",
  "allows",
  "allow",
  "allowed",
  "fast",
  "faster",
  "easy",
  "easier",
  "simple",
  "simpler",
  "stable",
  "reliable",
  "works",
  "working",
  "good",
  "great",
  "missing",
  "lack",
  "lacks",
  "lacking",
  "slow",
  "slower",
  "difficult",
  "hard",
  "confusing",
  "broken",
  "problem",
  "problems",
  "issue",
  "issues",
  "frustrating",
  "bad",
  "poor",
  "worse",
  "without",
  "unsupported",
  "unreliable",
  "request",
  "requests",
  "requested",
  "want",
  "wants",
  "wanted",
  "need",
  "needs",
  "needed",
  "wish",
  "roadmap"
]);

const POSITIVE_POLARITY_TERMS = [
  "support",
  "supports",
  "supported",
  "available",
  "offers",
  "offer",
  "includes",
  "include",
  "included",
  "enables",
  "enable",
  "enabled",
  "allows",
  "allow",
  "allowed",
  "fast",
  "faster",
  "easy",
  "easier",
  "simple",
  "simpler",
  "stable",
  "reliable",
  "works",
  "working",
  "good",
  "great",
  "improved",
  "improves"
];

const NEGATIVE_POLARITY_TERMS = [
  "missing",
  "lack",
  "lacks",
  "lacking",
  "slow",
  "slower",
  "difficult",
  "hard",
  "confusing",
  "broken",
  "problem",
  "problems",
  "issue",
  "issues",
  "frustrating",
  "bad",
  "poor",
  "worse",
  "without",
  "unsupported",
  "unreliable",
  "error",
  "errors",
  "fail",
  "fails",
  "failing"
];

const REQUEST_POLARITY_TERMS = [
  "request",
  "requests",
  "requested",
  "want",
  "wants",
  "wanted",
  "need",
  "needs",
  "needed",
  "wish",
  "roadmap"
];

function tokenizeClusterText(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !CLUSTER_STOP_WORDS.has(token));
}

function normalizeTopicToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }
  return token;
}

function tokenizeContradictionTopic(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .map((token) => normalizeTopicToken(token.trim()))
    .filter(
      (token) =>
        token.length >= 3 &&
        !CLUSTER_STOP_WORDS.has(token) &&
        !POLARITY_STOP_WORDS.has(token)
    );
}

function buildClusterSignature(text: string, kind: AgentEvidenceExtraction["kind"]): string {
  const tokens = uniqueValues(tokenizeClusterText(text), 6).sort();
  if (tokens.length === 0) {
    return normalizeExtractionValue(text);
  }

  if (kind === "entity" || kind === "theme") {
    return tokens.slice(0, Math.min(4, tokens.length)).join(" ");
  }

  return tokens.slice(0, Math.min(6, tokens.length)).join(" ");
}

function jaccardSimilarity(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  return intersection / (leftSet.size + rightSet.size - intersection);
}

function sharedTokens(left: string[], right: string[]): string[] {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection: string[] = [];

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection.push(token);
    }
  }

  return intersection;
}

function clusterThreshold(kind: AgentEvidenceExtraction["kind"]): number {
  switch (kind) {
    case "entity":
      return 0.95;
    case "theme":
      return 0.65;
    case "complaint":
    case "feature_request":
    case "claim":
      return 0.52;
    default:
      return 0.65;
  }
}

function chooseClusterLabel(values: string[]): string {
  const sorted = [...values].sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length;
    }
    return left.localeCompare(right);
  });

  return sorted[0] ?? "";
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function detectClusterPolarity(
  cluster: AgentEvidenceCluster
): "positive" | "negative" | "request" | "mixed" | "neutral" {
  if (cluster.kind === "complaint") {
    return "negative";
  }
  if (cluster.kind === "feature_request") {
    return "request";
  }

  const haystack = `${cluster.label} ${cluster.supportingValues.join(" ")}`.toLowerCase();
  let positiveHits = 0;
  let negativeHits = 0;
  let requestHits = 0;

  for (const term of POSITIVE_POLARITY_TERMS) {
    if (haystack.includes(term)) {
      positiveHits += 1;
    }
  }
  for (const term of NEGATIVE_POLARITY_TERMS) {
    if (haystack.includes(term)) {
      negativeHits += 1;
    }
  }
  for (const term of REQUEST_POLARITY_TERMS) {
    if (haystack.includes(term)) {
      requestHits += 1;
    }
  }

  if (positiveHits > 0 && negativeHits > 0) {
    return "mixed";
  }
  if (requestHits > 0 && negativeHits === 0 && positiveHits === 0) {
    return "request";
  }
  if (negativeHits > 0 && positiveHits === 0) {
    return requestHits > 0 ? "request" : "negative";
  }
  if (positiveHits > 0 && negativeHits === 0) {
    return "positive";
  }
  if (requestHits > 0) {
    return "request";
  }
  return cluster.kind === "claim" ? "neutral" : "mixed";
}

function contradictionsByPolarity(
  left: "positive" | "negative" | "request" | "mixed" | "neutral",
  right: "positive" | "negative" | "request" | "mixed" | "neutral"
): boolean {
  const pair = `${left}:${right}`;
  return (
    pair === "positive:negative" ||
    pair === "negative:positive" ||
    pair === "positive:request" ||
    pair === "request:positive"
  );
}

function scoreFreshness(isoTimestamp: string | null | undefined): number {
  if (!isoTimestamp) {
    return 0.35;
  }

  const millis = Date.parse(isoTimestamp);
  if (!Number.isFinite(millis)) {
    return 0.35;
  }

  const ageDays = Math.max(0, (Date.now() - millis) / (1000 * 60 * 60 * 24));
  if (ageDays <= 1) {
    return 1;
  }
  if (ageDays <= 7) {
    return 0.95;
  }
  if (ageDays <= 30) {
    return 0.85;
  }
  if (ageDays <= 90) {
    return 0.65;
  }
  if (ageDays <= 365) {
    return 0.4;
  }
  return 0.2;
}

function scoreSourceQuality(input: {
  site: string;
  title: string;
  description?: string;
  reviewStatus?: "read" | "skipped" | "error";
  dwellSeconds?: number;
  skipReason?: string;
  headings: string[];
  paragraphs: string[];
  hasDocument: boolean;
}): { score: number; signals: string[] } {
  let score = 0.42;
  const signals: string[] = [];
  const site = input.site.toLowerCase();

  if (site.endsWith(".gov")) {
    score += 0.25;
    signals.push("government domain");
  } else if (site.endsWith(".edu")) {
    score += 0.2;
    signals.push("education domain");
  } else if (site === "github.com") {
    score += 0.14;
    signals.push("github source");
  } else if (site.startsWith("docs.") || site.startsWith("developer.")) {
    score += 0.14;
    signals.push("documentation domain");
  } else if (site.endsWith(".org")) {
    score += 0.08;
    signals.push("organization domain");
  }

  if (
    site.includes("facebook.com") ||
    site.includes("instagram.com") ||
    site.includes("pinterest.") ||
    site === "x.com" ||
    site.endsWith(".tiktok.com")
  ) {
    score -= 0.14;
    signals.push("social domain");
  }

  if (input.hasDocument) {
    score += 0.12;
    signals.push("captured page");
  }

  if ((input.description?.length ?? 0) >= 80) {
    score += 0.05;
    signals.push("good description");
  }

  if (input.headings.length >= 2) {
    score += 0.05;
    signals.push("multiple headings");
  }

  if (input.paragraphs.length >= 2) {
    score += 0.1;
    signals.push("multiple paragraphs");
  } else if (input.paragraphs.length === 1) {
    score += 0.04;
    signals.push("single paragraph");
  }

  if (input.reviewStatus === "read") {
    score += 0.12;
    signals.push("reviewed in depth");
  } else if (input.reviewStatus === "skipped") {
    score -= 0.08;
    signals.push("skipped during review");
  } else if (input.reviewStatus === "error") {
    score -= 0.18;
    signals.push("page review error");
  }

  if ((input.dwellSeconds ?? 0) >= 10) {
    score += 0.05;
    signals.push("longer dwell");
  }

  const skipReason = (input.skipReason ?? "").toLowerCase();
  if (skipReason.includes("thin")) {
    score -= 0.12;
    signals.push("thin content");
  }
  if (skipReason.includes("error")) {
    score -= 0.16;
    signals.push("error-like page");
  }

  if (input.title.length >= 20) {
    score += 0.02;
  }

  return {
    score: clampUnit(score),
    signals
  };
}

function ensureParentDir(filePath: string): void {
  const dirPath = path.dirname(filePath);
  fs.mkdirSync(dirPath, { recursive: true });
}

export function resolveJobDatabasePath(customPath?: string): string {
  return path.resolve(customPath ?? process.env.WEB_TASK_AGENT_DB_PATH ?? DEFAULT_DATABASE_PATH);
}

function initializeSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      workflow_name TEXT,
      title TEXT NOT NULL,
      instruction TEXT,
      status TEXT NOT NULL,
      cache_path TEXT,
      report_path TEXT,
      artifact_dir TEXT,
      input_json TEXT NOT NULL DEFAULT '{}',
      budget_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT '{}',
      error_message TEXT,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS job_steps (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      step_key TEXT NOT NULL,
      position INTEGER NOT NULL,
      title TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      error_message TEXT,
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      UNIQUE(job_id, step_key)
    );

    CREATE TABLE IF NOT EXISTS job_artifacts (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      artifact_key TEXT NOT NULL,
      artifact_type TEXT NOT NULL,
      path TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      UNIQUE(job_id, artifact_key)
    );

    CREATE TABLE IF NOT EXISTS research_queries (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      query TEXT NOT NULL,
      search_provider TEXT NOT NULL,
      search_url TEXT,
      searched_at TEXT NOT NULL,
      status TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      UNIQUE(job_id, query)
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      canonical_url TEXT NOT NULL UNIQUE,
      raw_url TEXT NOT NULL,
      source_type TEXT NOT NULL,
      site TEXT,
      title TEXT,
      description TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS job_sources (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      query_id TEXT,
      source_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      result_url TEXT NOT NULL,
      page_url TEXT,
      title TEXT NOT NULL,
      snippet TEXT,
      site TEXT,
      review_status TEXT,
      dwell_seconds INTEGER,
      skip_reason TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      FOREIGN KEY(query_id) REFERENCES research_queries(id) ON DELETE CASCADE,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE,
      UNIQUE(job_id, query_id, source_id)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      job_id TEXT,
      query_id TEXT,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      h1 TEXT,
      headings_json TEXT NOT NULL DEFAULT '[]',
      paragraphs_json TEXT NOT NULL DEFAULT '[]',
      content_text TEXT NOT NULL DEFAULT '',
      checksum_sha256 TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL,
      FOREIGN KEY(query_id) REFERENCES research_queries(id) ON DELETE SET NULL,
      UNIQUE(source_id, checksum_sha256)
    );

    CREATE TABLE IF NOT EXISTS extractions (
      id TEXT PRIMARY KEY,
      job_id TEXT,
      query_id TEXT,
      source_id TEXT NOT NULL,
      document_id TEXT,
      kind TEXT NOT NULL,
      value TEXT NOT NULL,
      normalized_value TEXT NOT NULL,
      evidence_text TEXT,
      confidence REAL NOT NULL,
      method TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL,
      FOREIGN KEY(query_id) REFERENCES research_queries(id) ON DELETE SET NULL,
      FOREIGN KEY(source_id) REFERENCES sources(id) ON DELETE CASCADE,
      FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE(source_id, document_id, kind, normalized_value)
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_task_type ON jobs(task_type);
    CREATE INDEX IF NOT EXISTS idx_job_steps_job_id ON job_steps(job_id, position);
    CREATE INDEX IF NOT EXISTS idx_job_artifacts_job_id ON job_artifacts(job_id);
    CREATE INDEX IF NOT EXISTS idx_research_queries_job_id ON research_queries(job_id, searched_at);
    CREATE INDEX IF NOT EXISTS idx_sources_site ON sources(site);
    CREATE INDEX IF NOT EXISTS idx_job_sources_job_id ON job_sources(job_id, rank);
    CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_documents_canonical_url ON documents(canonical_url);
    CREATE INDEX IF NOT EXISTS idx_extractions_job_id ON extractions(job_id, kind);
    CREATE INDEX IF NOT EXISTS idx_extractions_source_id ON extractions(source_id, kind);
    CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON extractions(document_id);
  `);
}

function getDatabase(customPath?: string): { db: DatabaseSync; databasePath: string } {
  const databasePath = resolveJobDatabasePath(customPath);

  if (!sharedDatabase || sharedDatabasePath !== databasePath) {
    ensureParentDir(databasePath);
    sharedDatabase = new DatabaseSync(databasePath);
    initializeSchema(sharedDatabase);
    sharedDatabasePath = databasePath;
  }

  return {
    db: sharedDatabase,
    databasePath
  };
}

export class JobStore {
  readonly databasePath: string;
  private readonly db: DatabaseSync;
  private readonly jobId: string;
  private job: Required<Omit<JobStoreOptions, "databasePath">>;

  constructor(options: JobStoreOptions) {
    const { db, databasePath } = getDatabase(options.databasePath);

    this.db = db;
    this.databasePath = databasePath;
    this.jobId = options.jobId;
    this.job = {
      jobId: options.jobId,
      taskType: options.taskType,
      workflowName: options.workflowName ?? null,
      title: options.title,
      instruction: options.instruction ?? null,
      status: options.status,
      startedAt: options.startedAt,
      updatedAt: options.updatedAt ?? nowIso(),
      completedAt: options.completedAt ?? null,
      cachePath: options.cachePath ?? null,
      reportPath: options.reportPath ?? null,
      artifactDir: options.artifactDir ?? null,
      input: options.input ?? {},
      budget: options.budget ?? {},
      output: options.output ?? {},
      errorMessage: options.errorMessage ?? null
    };

    this.upsertJob();
  }

  private upsertJob(): void {
    this.db.prepare(`
      INSERT INTO jobs (
        id, task_type, workflow_name, title, instruction, status, cache_path, report_path,
        artifact_dir, input_json, budget_json, output_json, error_message, started_at,
        updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        task_type = excluded.task_type,
        workflow_name = excluded.workflow_name,
        title = excluded.title,
        instruction = excluded.instruction,
        status = excluded.status,
        cache_path = excluded.cache_path,
        report_path = excluded.report_path,
        artifact_dir = excluded.artifact_dir,
        input_json = excluded.input_json,
        budget_json = excluded.budget_json,
        output_json = excluded.output_json,
        error_message = excluded.error_message,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at
    `).run(
      this.job.jobId,
      this.job.taskType,
      this.job.workflowName,
      this.job.title,
      this.job.instruction,
      this.job.status,
      this.job.cachePath,
      this.job.reportPath,
      this.job.artifactDir,
      serializeJson(this.job.input),
      serializeJson(this.job.budget),
      serializeJson(this.job.output),
      this.job.errorMessage,
      this.job.startedAt,
      this.job.updatedAt,
      this.job.completedAt
    );
  }

  private getStep(stepKey: string): JobStepRow | null {
    const row = this.db.prepare(`
      SELECT attempt_count, started_at
      FROM job_steps
      WHERE job_id = ? AND step_key = ?
    `).get(this.jobId, stepKey);

    if (!row || typeof row !== "object") {
      return null;
    }

    return {
      attempt_count: Number((row as Record<string, unknown>).attempt_count ?? 0),
      started_at:
        typeof (row as Record<string, unknown>).started_at === "string"
          ? String((row as Record<string, unknown>).started_at)
          : null
    };
  }

  private writeStep(step: JobStepDefinition, options: StepWriteOptions): void {
    const existing = this.getStep(step.stepKey);
    const updatedAt = nowIso();
    const startedAt =
      existing?.started_at ??
      (options.status === "running" || options.status === "completed" || options.status === "failed"
        ? updatedAt
        : null);
    const completedAt =
      typeof options.completedAt === "string"
        ? options.completedAt
        : options.status === "completed" || options.status === "failed" || options.status === "skipped"
          ? updatedAt
          : null;
    const attemptCount = (existing?.attempt_count ?? 0) + (options.bumpAttempt ? 1 : 0);
    const durationMs =
      startedAt && completedAt ? Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) : null;

    this.db.prepare(`
      INSERT INTO job_steps (
        id, job_id, step_key, position, title, kind, status, attempt_count,
        started_at, updated_at, completed_at, duration_ms, error_message, input_json, output_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(job_id, step_key) DO UPDATE SET
        position = excluded.position,
        title = excluded.title,
        kind = excluded.kind,
        status = excluded.status,
        attempt_count = excluded.attempt_count,
        started_at = excluded.started_at,
        updated_at = excluded.updated_at,
        completed_at = excluded.completed_at,
        duration_ms = excluded.duration_ms,
        error_message = excluded.error_message,
        input_json = excluded.input_json,
        output_json = excluded.output_json
    `).run(
      `${this.jobId}:${step.stepKey}`,
      this.jobId,
      step.stepKey,
      step.position,
      step.title,
      step.kind,
      options.status,
      attemptCount,
      startedAt,
      updatedAt,
      completedAt,
      durationMs,
      options.errorMessage ?? null,
      serializeJson(step.input),
      serializeJson(options.output)
    );
  }

  syncJob(patch: Partial<Omit<JobStoreOptions, "jobId" | "taskType" | "startedAt" | "databasePath">>): void {
    this.job = {
      ...this.job,
      workflowName: patch.workflowName !== undefined ? patch.workflowName ?? null : this.job.workflowName,
      title: patch.title ?? this.job.title,
      instruction: patch.instruction !== undefined ? patch.instruction ?? null : this.job.instruction,
      status: patch.status ?? this.job.status,
      completedAt: patch.completedAt !== undefined ? patch.completedAt ?? null : this.job.completedAt,
      cachePath: patch.cachePath !== undefined ? patch.cachePath ?? null : this.job.cachePath,
      reportPath: patch.reportPath !== undefined ? patch.reportPath ?? null : this.job.reportPath,
      artifactDir: patch.artifactDir !== undefined ? patch.artifactDir ?? null : this.job.artifactDir,
      input: patch.input ?? this.job.input,
      budget: patch.budget ?? this.job.budget,
      output: patch.output ?? this.job.output,
      errorMessage: patch.errorMessage !== undefined ? patch.errorMessage ?? null : this.job.errorMessage,
      updatedAt: patch.updatedAt ?? nowIso()
    };
    this.upsertJob();
  }

  setStatus(
    status: JobLifecycleStatus,
    options?: {
      output?: unknown;
      errorMessage?: string | null;
      completedAt?: string | null;
    }
  ): void {
    this.syncJob({
      status,
      output: options?.output ?? this.job.output,
      errorMessage: options?.errorMessage,
      completedAt: options?.completedAt
    });
  }

  registerArtifact(
    artifactKey: string,
    artifactType: string,
    artifactPath: string,
    metadata?: unknown
  ): void {
    const timestamp = nowIso();

    this.db.prepare(`
      INSERT INTO job_artifacts (
        id, job_id, artifact_key, artifact_type, path, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, artifact_key) DO UPDATE SET
        artifact_type = excluded.artifact_type,
        path = excluded.path,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      `${this.jobId}:${artifactKey}`,
      this.jobId,
      artifactKey,
      artifactType,
      path.resolve(artifactPath),
      serializeJson(metadata),
      timestamp,
      timestamp
    );
  }

  persistAgentResearchResult(
    research: AgentResearchResult,
    options?: PersistAgentResearchOptions
  ): { queryId: string; sourceCount: number; documentCount: number; extractionCount: number } {
    const timestamp = nowIso();
    const queryId = `${this.jobId}:query:${hashValue(research.query.toLowerCase()).slice(0, 16)}`;
    const queryStatus =
      research.error
        ? "failed"
        : research.results.length === 0
          ? "empty"
          : "completed";
    const searchProvider = options?.searchProvider ?? "unknown";

    this.db.prepare(`
      INSERT INTO research_queries (
        id, job_id, query, search_provider, search_url, searched_at, status,
        result_count, error_message, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id, query) DO UPDATE SET
        search_provider = excluded.search_provider,
        search_url = excluded.search_url,
        searched_at = excluded.searched_at,
        status = excluded.status,
        result_count = excluded.result_count,
        error_message = excluded.error_message,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at
    `).run(
      queryId,
      this.jobId,
      research.query,
      searchProvider,
      options?.searchUrl ?? null,
      research.searchedAt,
      queryStatus,
      research.results.length,
      research.error ?? null,
      serializeJson({
        resultUrls: research.results.map((result) => result.url)
      }),
      timestamp,
      timestamp
    );

    let documentCount = 0;
    let extractionCount = 0;

    research.results.forEach((result, index) => {
      const pageUrl = result.page?.url ?? result.url;
      const canonicalUrl = canonicalizeUrl(pageUrl);
      const sourceId = `src_${hashValue(canonicalUrl).slice(0, 24)}`;
      const resultUrl = result.url;
      const site = result.site || hostnameOf(pageUrl) || hostnameOf(resultUrl) || "";
      const sourceTitle = result.page?.title || result.title;
      const sourceDescription = result.page?.description || result.snippet || "";

      this.db.prepare(`
        INSERT INTO sources (
          id, canonical_url, raw_url, source_type, site, title, description,
          first_seen_at, last_seen_at, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(canonical_url) DO UPDATE SET
          raw_url = excluded.raw_url,
          source_type = excluded.source_type,
          site = excluded.site,
          title = CASE
            WHEN excluded.title IS NOT NULL AND excluded.title != '' THEN excluded.title
            ELSE sources.title
          END,
          description = CASE
            WHEN excluded.description IS NOT NULL AND excluded.description != '' THEN excluded.description
            ELSE sources.description
          END,
          last_seen_at = excluded.last_seen_at,
          metadata_json = excluded.metadata_json
      `).run(
        sourceId,
        canonicalUrl,
        pageUrl,
        "web_page",
        site || null,
        sourceTitle || null,
        sourceDescription || null,
        research.searchedAt,
        research.searchedAt,
        serializeJson({
          searchProvider
        })
      );

      this.db.prepare(`
        INSERT INTO job_sources (
          id, job_id, query_id, source_id, rank, result_url, page_url, title, snippet,
          site, review_status, dwell_seconds, skip_reason, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_id, query_id, source_id) DO UPDATE SET
          rank = excluded.rank,
          result_url = excluded.result_url,
          page_url = excluded.page_url,
          title = excluded.title,
          snippet = excluded.snippet,
          site = excluded.site,
          review_status = excluded.review_status,
          dwell_seconds = excluded.dwell_seconds,
          skip_reason = excluded.skip_reason,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run(
        `${queryId}:${sourceId}`,
        this.jobId,
        queryId,
        sourceId,
        index + 1,
        resultUrl,
        result.page?.url ?? null,
        result.title,
        result.snippet,
        site || null,
        result.reviewStatus ?? null,
        result.dwellSeconds ?? null,
        result.skipReason ?? null,
        serializeJson({
          hasPageDigest: Boolean(result.page),
          searchProvider
        }),
        research.searchedAt,
        timestamp
      );

      let documentId: string | null = null;
      if (result.page) {
        const contentText = buildDigestText(result);
        const checksum = hashValue(contentText);
        documentId = `doc_${hashValue(`${sourceId}:${checksum}`).slice(0, 24)}`;

        this.db.prepare(`
          INSERT INTO documents (
            id, source_id, job_id, query_id, url, canonical_url, title, description, h1,
            headings_json, paragraphs_json, content_text, checksum_sha256, captured_at,
            metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(source_id, checksum_sha256) DO UPDATE SET
            job_id = excluded.job_id,
            query_id = excluded.query_id,
            url = excluded.url,
            title = excluded.title,
            description = excluded.description,
            h1 = excluded.h1,
            headings_json = excluded.headings_json,
            paragraphs_json = excluded.paragraphs_json,
            content_text = excluded.content_text,
            captured_at = excluded.captured_at,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `).run(
          documentId,
          sourceId,
          this.jobId,
          queryId,
          result.page.url,
          canonicalUrl,
          result.page.title,
          result.page.description,
          result.page.h1,
          serializeJson(result.page.headings),
          serializeJson(result.page.paragraphs),
          contentText,
          checksum,
          result.page.capturedAt,
          serializeJson({
            reviewStatus: result.reviewStatus ?? null,
            dwellSeconds: result.dwellSeconds ?? null,
            skipReason: result.skipReason ?? null
          }),
          result.page.capturedAt,
          timestamp
        );

        documentCount += 1;
      }

      const extractionCandidates =
        options?.getExtractionCandidates?.(result) ?? buildHeuristicExtractionCandidates(result);
      extractionCandidates.forEach((candidate) => {
        const normalizedValue = normalizeExtractionValue(candidate.value);
        const extractionId = `ext_${hashValue(
          `${sourceId}:${documentId ?? "none"}:${candidate.kind}:${normalizedValue}`
        ).slice(0, 24)}`;

        this.db.prepare(`
          INSERT INTO extractions (
            id, job_id, query_id, source_id, document_id, kind, value, normalized_value,
            evidence_text, confidence, method, metadata_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            job_id = excluded.job_id,
            query_id = excluded.query_id,
            source_id = excluded.source_id,
            document_id = excluded.document_id,
            kind = excluded.kind,
            value = excluded.value,
            normalized_value = excluded.normalized_value,
            evidence_text = excluded.evidence_text,
            confidence = excluded.confidence,
            method = excluded.method,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
        `).run(
          extractionId,
          this.jobId,
          queryId,
          sourceId,
          documentId,
          candidate.kind,
          candidate.value,
          normalizedValue,
          candidate.evidenceText,
          clampConfidence(candidate.confidence),
          candidate.method,
          serializeJson(candidate.metadata),
          timestamp,
          timestamp
        );

        extractionCount += 1;
      });
    });

    return {
      queryId,
      sourceCount: research.results.length,
      documentCount,
      extractionCount
    };
  }

  getAgentEvidenceBundle(): AgentEvidenceBundle {
    const queryRows = this.db.prepare(`
      SELECT query, searched_at, status, result_count, error_message, search_provider
      FROM research_queries
      WHERE job_id = ?
      ORDER BY searched_at ASC, query ASC
    `).all(this.jobId) as Array<Record<string, unknown>>;

    const sourceRows = this.db.prepare(`
      SELECT
        rq.query AS query,
        rq.status AS query_status,
        rq.searched_at AS searched_at,
        js.rank AS rank,
        js.source_id AS source_id,
        js.title AS title,
        COALESCE(js.page_url, s.raw_url) AS url,
        s.canonical_url AS canonical_url,
        COALESCE(js.site, s.site, '') AS site,
        COALESCE(js.snippet, '') AS snippet,
        js.review_status AS review_status,
        js.dwell_seconds AS dwell_seconds,
        js.skip_reason AS skip_reason,
        d.id AS document_id,
        d.captured_at AS captured_at,
        d.title AS page_title,
        d.description AS description,
        d.headings_json AS headings_json,
        d.paragraphs_json AS paragraphs_json
      FROM job_sources js
      LEFT JOIN research_queries rq ON rq.id = js.query_id
      INNER JOIN sources s ON s.id = js.source_id
      LEFT JOIN documents d ON d.id = (
        SELECT d2.id
        FROM documents d2
        WHERE d2.source_id = js.source_id
          AND d2.job_id = js.job_id
          AND (js.query_id IS NULL OR d2.query_id = js.query_id)
        ORDER BY d2.captured_at DESC
        LIMIT 1
      )
      WHERE js.job_id = ?
      ORDER BY rq.searched_at ASC, js.rank ASC, js.title ASC
    `).all(this.jobId) as Array<Record<string, unknown>>;

    const extractionRows = this.db.prepare(`
      SELECT
        e.id AS id,
        e.source_id AS source_id,
        e.document_id AS document_id,
        e.kind AS kind,
        e.value AS value,
        e.evidence_text AS evidence_text,
        e.confidence AS confidence,
        e.method AS method
      FROM extractions e
      WHERE e.job_id = ?
      ORDER BY e.confidence DESC, e.updated_at DESC, e.value ASC
    `).all(this.jobId) as Array<Record<string, unknown>>;

    const queries: AgentEvidenceQuery[] = queryRows.map((row) => ({
      query: String(row.query ?? ""),
      searchedAt: String(row.searched_at ?? ""),
      status: String(row.status ?? "empty") as AgentEvidenceQuery["status"],
      resultCount: Number(row.result_count ?? 0),
      error: row.error_message ? String(row.error_message) : undefined,
      searchProvider: String(row.search_provider ?? "unknown")
    }));

    const extractionsByKey = new Map<string, AgentEvidenceExtraction[]>();
    for (const row of extractionRows) {
      const sourceId = String(row.source_id ?? "");
      const documentId =
        row.document_id === null || row.document_id === undefined ? null : String(row.document_id);
      const extraction: AgentEvidenceExtraction = {
        id: String(row.id ?? ""),
        sourceId,
        documentId,
        kind: String(row.kind ?? "claim") as AgentEvidenceExtraction["kind"],
        value: String(row.value ?? ""),
        evidenceText:
          row.evidence_text === null || row.evidence_text === undefined
            ? null
            : String(row.evidence_text),
        confidence: Number(row.confidence ?? 0),
        method: String(row.method ?? "unknown")
      };
      const key = `${sourceId}:${documentId ?? "none"}`;
      const existing = extractionsByKey.get(key) ?? [];
      existing.push(extraction);
      extractionsByKey.set(key, existing);
    }

    const sources: AgentEvidenceSource[] = sourceRows.map((row) => {
      const sourceId = String(row.source_id ?? "");
      const documentId =
        row.document_id === null || row.document_id === undefined ? null : String(row.document_id);
      const headings = parseJsonValue<string[]>(row.headings_json, []);
      const paragraphs = parseJsonValue<string[]>(row.paragraphs_json, []);
      const extractions = extractionsByKey.get(`${sourceId}:${documentId ?? "none"}`) ?? [];
      const capturedAt =
        row.captured_at === null || row.captured_at === undefined ? undefined : String(row.captured_at);
      const quality = scoreSourceQuality({
        site: String(row.site ?? ""),
        title: String(row.title ?? ""),
        description: row.description ? String(row.description) : undefined,
        reviewStatus: row.review_status ? String(row.review_status) as AgentEvidenceSource["reviewStatus"] : undefined,
        dwellSeconds: row.dwell_seconds === null || row.dwell_seconds === undefined ? undefined : Number(row.dwell_seconds),
        skipReason: row.skip_reason ? String(row.skip_reason) : undefined,
        headings,
        paragraphs,
        hasDocument: Boolean(documentId)
      });
      const freshnessScore = scoreFreshness(capturedAt ?? String(row.searched_at ?? ""));
      const overallScore = clampUnit(quality.score * 0.65 + freshnessScore * 0.35);

      return {
        query: String(row.query ?? ""),
        queryStatus: String(row.query_status ?? "empty") as AgentEvidenceQuery["status"],
        rank: Number(row.rank ?? 0),
        sourceId,
        documentId,
        title: String(row.title ?? ""),
        url: String(row.url ?? ""),
        canonicalUrl: String(row.canonical_url ?? ""),
        site: String(row.site ?? ""),
        snippet: String(row.snippet ?? ""),
        reviewStatus: row.review_status ? String(row.review_status) as AgentEvidenceSource["reviewStatus"] : undefined,
        dwellSeconds: row.dwell_seconds === null || row.dwell_seconds === undefined ? undefined : Number(row.dwell_seconds),
        skipReason: row.skip_reason ? String(row.skip_reason) : undefined,
        capturedAt,
        pageTitle: row.page_title ? String(row.page_title) : undefined,
        description: row.description ? String(row.description) : undefined,
        headings,
        paragraphs,
        qualitySignals: quality.signals,
        sourceQualityScore: quality.score,
        freshnessScore,
        overallScore,
        extractions
      };
    });

    interface ClusterItem {
      extraction: AgentEvidenceExtraction;
      source: AgentEvidenceSource;
      tokens: string[];
      signature: string;
    }

    interface ClusterWorking {
      kind: AgentEvidenceExtraction["kind"];
      items: ClusterItem[];
      tokenSet: Set<string>;
      signature: string;
    }

    const clusterItems: ClusterItem[] = [];
    for (const source of sources) {
      for (const extraction of source.extractions) {
        clusterItems.push({
          extraction,
          source,
          tokens: tokenizeClusterText(extraction.value),
          signature: buildClusterSignature(extraction.value, extraction.kind)
        });
      }
    }

    const clusterGroups: ClusterWorking[] = [];
    for (const item of clusterItems) {
      const threshold = clusterThreshold(item.extraction.kind);
      let bestCluster: ClusterWorking | null = null;
      let bestScore = 0;

      for (const cluster of clusterGroups) {
        if (cluster.kind !== item.extraction.kind) {
          continue;
        }

        const sameSignature = cluster.signature === item.signature && item.signature.length > 0;
        const similarity = jaccardSimilarity(item.tokens, Array.from(cluster.tokenSet));
        const leftValue = normalizeExtractionValue(item.extraction.value);
        const representative = normalizeExtractionValue(cluster.items[0]?.extraction.value ?? "");
        const containsMatch =
          (leftValue.length > 0 && representative.includes(leftValue)) ||
          (representative.length > 0 && leftValue.includes(representative));
        const score = sameSignature ? 1 : containsMatch ? Math.max(similarity, 0.9) : similarity;

        if (score >= threshold && score > bestScore) {
          bestScore = score;
          bestCluster = cluster;
        }
      }

      if (bestCluster) {
        bestCluster.items.push(item);
        for (const token of item.tokens) {
          bestCluster.tokenSet.add(token);
        }
      } else {
        clusterGroups.push({
          kind: item.extraction.kind,
          items: [item],
          tokenSet: new Set(item.tokens),
          signature: item.signature
        });
      }
    }

    const clusters: AgentEvidenceCluster[] = clusterGroups
      .map((cluster, index) => {
        const sourceIds = Array.from(new Set(cluster.items.map((item) => item.source.sourceId)));
        const evidenceIds = Array.from(new Set(cluster.items.map((item) => item.extraction.id)));
        const queries = Array.from(new Set(cluster.items.map((item) => item.source.query)));
        const supportingValues = uniqueValues(
          cluster.items.map((item) => item.extraction.value),
          5
        );
        const label = chooseClusterLabel(supportingValues);
        const averageConfidence =
          cluster.items.reduce((total, item) => total + item.extraction.confidence, 0) /
          Math.max(1, cluster.items.length);
        const qualityScore =
          cluster.items.reduce((total, item) => total + item.source.sourceQualityScore, 0) /
          Math.max(1, cluster.items.length);
        const freshnessScore =
          cluster.items.reduce((total, item) => total + item.source.freshnessScore, 0) /
          Math.max(1, cluster.items.length);
        const supportScore = Math.min(1, cluster.items.length / 3);
        const overallScore = clampUnit(
          qualityScore * 0.4 + freshnessScore * 0.2 + averageConfidence * 0.2 + supportScore * 0.2
        );

        return {
          id: `cluster_${cluster.kind}_${String(index + 1).padStart(3, "0")}`,
          kind: cluster.kind,
          label,
          sourceCount: sourceIds.length,
          evidenceCount: evidenceIds.length,
          averageConfidence: clampUnit(averageConfidence),
          qualityScore: clampUnit(qualityScore),
          freshnessScore: clampUnit(freshnessScore),
          overallScore,
          sourceIds,
          evidenceIds,
          queries,
          supportingValues
        };
      })
      .sort((left, right) => {
        if (right.overallScore !== left.overallScore) {
          return right.overallScore - left.overallScore;
        }
        if (right.sourceCount !== left.sourceCount) {
          return right.sourceCount - left.sourceCount;
        }
        if (right.evidenceCount !== left.evidenceCount) {
          return right.evidenceCount - left.evidenceCount;
        }
        return left.label.localeCompare(right.label);
      });

    const clusteredHighlights = (kind: AgentEvidenceExtraction["kind"]) =>
      uniqueValues(
        clusters
          .filter((cluster) => cluster.kind === kind)
          .sort((left, right) => {
            if (right.sourceCount !== left.sourceCount) {
              return right.sourceCount - left.sourceCount;
            }
            return right.averageConfidence - left.averageConfidence;
          })
          .map((cluster) => cluster.label),
        8
      );

    const highlights = {
      entities: clusteredHighlights("entity"),
      themes: clusteredHighlights("theme"),
      complaints: clusteredHighlights("complaint"),
      featureRequests: clusteredHighlights("feature_request"),
      claims: clusteredHighlights("claim")
    };

    const contradictionCandidates: AgentEvidenceContradiction[] = [];
    const claimLikeClusters = clusters.filter((cluster) =>
      cluster.kind === "claim" || cluster.kind === "complaint" || cluster.kind === "feature_request"
    );

    for (let leftIndex = 0; leftIndex < claimLikeClusters.length; leftIndex += 1) {
      const left = claimLikeClusters[leftIndex];
      const leftPolarity = detectClusterPolarity(left);
      const leftTopicTokens = tokenizeContradictionTopic(left.label);

      if (leftTopicTokens.length === 0) {
        continue;
      }

      for (let rightIndex = leftIndex + 1; rightIndex < claimLikeClusters.length; rightIndex += 1) {
        const right = claimLikeClusters[rightIndex];
        const rightPolarity = detectClusterPolarity(right);

        if (!contradictionsByPolarity(leftPolarity, rightPolarity)) {
          continue;
        }

        const combinedSourceIds = Array.from(new Set([...left.sourceIds, ...right.sourceIds]));
        if (combinedSourceIds.length < 2) {
          continue;
        }

        const rightTopicTokens = tokenizeContradictionTopic(right.label);
        if (rightTopicTokens.length === 0) {
          continue;
        }

        const topicSimilarity = jaccardSimilarity(leftTopicTokens, rightTopicTokens);
        const sharedTopicTokens = sharedTokens(leftTopicTokens, rightTopicTokens);
        if (topicSimilarity < 0.34 && sharedTopicTokens.length < 2) {
          continue;
        }

        const contradictionScore = clampUnit(
          topicSimilarity * 0.45 +
          ((left.overallScore + right.overallScore) / 2) * 0.35 +
          Math.min(1, combinedSourceIds.length / 3) * 0.2
        );
        if (contradictionScore < 0.45) {
          continue;
        }

        const topic =
          (sharedTopicTokens.length >= 2 ? sharedTopicTokens.slice(0, 2).join(" ") : "") ||
          chooseClusterLabel(
            uniqueValues(
              [...left.supportingValues, ...right.supportingValues].flatMap((value) => tokenizeContradictionTopic(value)),
              4
            )
          ) ||
          chooseClusterLabel(uniqueValues([...leftTopicTokens, ...rightTopicTokens], 4));

        contradictionCandidates.push({
          id: `contr_${hashValue(`${left.id}:${right.id}`).slice(0, 16)}`,
          topic: topic || "conflicting signal",
          leftClusterId: left.id,
          rightClusterId: right.id,
          leftKind: left.kind,
          rightKind: right.kind,
          leftLabel: left.label,
          rightLabel: right.label,
          leftScore: left.overallScore,
          rightScore: right.overallScore,
          contradictionScore,
          reason: `Topic overlap with opposing stances: ${leftPolarity} vs ${rightPolarity} across ${sharedTopicTokens.length} shared topic tokens`,
          sourceIds: combinedSourceIds,
          evidenceIds: Array.from(new Set([...left.evidenceIds, ...right.evidenceIds])).slice(0, 8),
          queries: Array.from(new Set([...left.queries, ...right.queries]))
        });
      }
    }

    const contradictions = contradictionCandidates
      .filter((candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index)
      .sort((left, right) => {
        if (right.contradictionScore !== left.contradictionScore) {
          return right.contradictionScore - left.contradictionScore;
        }
        return left.topic.localeCompare(right.topic);
      });

    return {
      counts: {
        queries: queries.length,
        sources: sources.length,
        documents: sources.filter((source) => Boolean(source.documentId)).length,
        extractions: extractionRows.length,
        clusters: clusters.length,
        contradictions: contradictions.length
      },
      queries,
      sources: [...sources].sort((left, right) => {
        if (right.overallScore !== left.overallScore) {
          return right.overallScore - left.overallScore;
        }
        return left.rank - right.rank;
      }),
      highlights,
      clusters,
      contradictions
    };
  }

  markPending(step: JobStepDefinition, output?: unknown): void {
    this.writeStep(step, {
      status: "pending",
      output
    });
  }

  markSkipped(step: JobStepDefinition, output?: unknown): void {
    this.writeStep(step, {
      status: "skipped",
      output
    });
  }

  startStep(step: JobStepDefinition): void {
    this.writeStep(step, {
      status: "running",
      bumpAttempt: true
    });
  }

  completeStep(step: JobStepDefinition, output?: unknown): void {
    this.writeStep(step, {
      status: "completed",
      output
    });
  }

  failStep(step: JobStepDefinition, error: unknown, output?: unknown): void {
    this.writeStep(step, {
      status: "failed",
      output,
      errorMessage: normalizeError(error)
    });
  }

  async runStep<T>(
    step: JobStepDefinition,
    work: () => Promise<T>,
    options?: {
      output?: (result: T) => unknown;
    }
  ): Promise<T> {
    this.startStep(step);

    try {
      const result = await work();
      this.completeStep(step, options?.output ? options.output(result) : undefined);
      return result;
    } catch (error) {
      this.failStep(step, error);
      throw error;
    }
  }
}
