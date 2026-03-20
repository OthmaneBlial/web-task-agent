import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  AgentResearchResult,
  AgentSearchResult,
  JobLifecycleStatus,
  JobStepDefinition,
  JobStepStatus,
  JobTaskType
} from "../types";

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
}

let sharedDatabase: DatabaseSync | null = null;
let sharedDatabasePath: string | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
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
    return [result.title, result.snippet].join("\n").trim();
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

    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
    CREATE INDEX IF NOT EXISTS idx_jobs_task_type ON jobs(task_type);
    CREATE INDEX IF NOT EXISTS idx_job_steps_job_id ON job_steps(job_id, position);
    CREATE INDEX IF NOT EXISTS idx_job_artifacts_job_id ON job_artifacts(job_id);
    CREATE INDEX IF NOT EXISTS idx_research_queries_job_id ON research_queries(job_id, searched_at);
    CREATE INDEX IF NOT EXISTS idx_sources_site ON sources(site);
    CREATE INDEX IF NOT EXISTS idx_job_sources_job_id ON job_sources(job_id, rank);
    CREATE INDEX IF NOT EXISTS idx_documents_source_id ON documents(source_id, captured_at);
    CREATE INDEX IF NOT EXISTS idx_documents_canonical_url ON documents(canonical_url);
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
  ): { queryId: string; sourceCount: number; documentCount: number } {
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

      if (result.page) {
        const contentText = buildDigestText(result);
        const checksum = hashValue(contentText);
        const documentId = `doc_${hashValue(`${sourceId}:${checksum}`).slice(0, 24)}`;

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
    });

    return {
      queryId,
      sourceCount: research.results.length,
      documentCount
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
