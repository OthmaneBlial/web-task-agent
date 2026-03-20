import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { AgentRunOptions } from "../types";
import { resolveJobDatabasePath } from "./job-store";

type QueuedJobStatus = "queued" | "running" | "completed" | "failed";

export interface QueuedAgentJobPayload {
  taskType: "agent";
  mode: "agent" | "workflow";
  label: string;
  options: AgentRunOptions;
}

export interface QueuedJobRecord {
  queueId: string;
  taskType: string;
  mode: string;
  label: string;
  status: QueuedJobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  runAfter: string;
  leaseExpiresAt: string | null;
  payload: QueuedAgentJobPayload;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? {});
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

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function addSecondsToIso(input: string, seconds: number): string {
  return new Date(Date.parse(input) + seconds * 1000).toISOString();
}

function getQueueDatabase(customPath?: string): { db: DatabaseSync; databasePath: string } {
  const databasePath = resolveJobDatabasePath(customPath);
  ensureParentDir(databasePath);
  const db = new DatabaseSync(databasePath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS queued_jobs (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      mode TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      run_after TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      last_error TEXT,
      leased_by TEXT,
      leased_at TEXT,
      lease_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_queued_jobs_status ON queued_jobs(status, run_after);
    CREATE INDEX IF NOT EXISTS idx_queued_jobs_lease_expires_at ON queued_jobs(lease_expires_at);
  `);

  return {
    db,
    databasePath
  };
}

function mapQueuedJob(row: Record<string, unknown>): QueuedJobRecord {
  return {
    queueId: String(row.id ?? ""),
    taskType: String(row.task_type ?? ""),
    mode: String(row.mode ?? ""),
    label: String(row.label ?? ""),
    status: String(row.status ?? "queued") as QueuedJobStatus,
    priority: Number(row.priority ?? 100),
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    runAfter: String(row.run_after ?? ""),
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    payload: parseJsonValue<QueuedAgentJobPayload>(row.payload_json, {
      taskType: "agent",
      mode: "agent",
      label: "",
      options: {
        instruction: "",
        resume: false
      }
    }),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function enqueueQueuedAgentJob(input: {
  databasePath?: string;
  payload: QueuedAgentJobPayload;
  priority?: number;
  maxAttempts?: number;
  delaySeconds?: number;
}): {
  queueId: string;
  databasePath: string;
  cachePath: string;
  reportPath: string;
} {
  const { db, databasePath } = getQueueDatabase(input.databasePath);
  const queueId = `queue_${randomUUID().slice(0, 8)}${hashValue(nowIso()).slice(0, 8)}`;
  const timestamp = nowIso();
  const cachePath =
    input.payload.options.cachePath ??
    path.join(process.cwd(), ".cache", "queued", `${queueId}.json`);
  const reportPath =
    input.payload.options.reportPath ??
    path.join(process.cwd(), "reports", "queued", queueId, "report.md");
  const payload: QueuedAgentJobPayload = {
    ...input.payload,
    options: {
      ...input.payload.options,
      cachePath,
      reportPath,
      resume: Boolean(input.payload.options.resume)
    }
  };

  db.prepare(`
    INSERT INTO queued_jobs (
      id, task_type, mode, label, status, priority, attempts, max_attempts,
      run_after, payload_json, result_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?, '{}', ?, ?)
  `).run(
    queueId,
    payload.taskType,
    payload.mode,
    payload.label,
    input.priority ?? 100,
    Math.max(1, Math.min(10, input.maxAttempts ?? 3)),
    addSecondsToIso(timestamp, Math.max(0, input.delaySeconds ?? 0)),
    serializeJson(payload),
    timestamp,
    timestamp
  );

  return {
    queueId,
    databasePath,
    cachePath,
    reportPath
  };
}

export function listQueuedJobs(options?: {
  databasePath?: string;
  status?: QueuedJobStatus;
  limit?: number;
}): QueuedJobRecord[] {
  const { db } = getQueueDatabase(options?.databasePath);
  const rows = db.prepare(`
    SELECT *
    FROM queued_jobs
    WHERE (? IS NULL OR status = ?)
    ORDER BY
      CASE status
        WHEN 'running' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'failed' THEN 2
        ELSE 3
      END,
      priority ASC,
      created_at ASC
    LIMIT ?
  `).all(
    options?.status ?? null,
    options?.status ?? null,
    Math.max(1, Math.min(100, options?.limit ?? 50))
  ) as Array<Record<string, unknown>>;

  return rows.map(mapQueuedJob);
}

export function recoverStaleQueuedJobs(options?: {
  databasePath?: string;
}): number {
  const { db } = getQueueDatabase(options?.databasePath);
  const timestamp = nowIso();
  const result = db.prepare(`
    UPDATE queued_jobs
    SET
      status = 'queued',
      leased_by = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      run_after = ?,
      updated_at = ?
    WHERE status = 'running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= ?
  `).run(
    timestamp,
    timestamp,
    timestamp
  );

  return Number(result.changes ?? 0);
}

export function claimNextQueuedJob(input: {
  databasePath?: string;
  workerId: string;
  leaseTtlSeconds: number;
}): QueuedJobRecord | null {
  const { db } = getQueueDatabase(input.databasePath);
  const timestamp = nowIso();
  const row = db.prepare(`
    SELECT *
    FROM queued_jobs
    WHERE status = 'queued'
      AND run_after <= ?
    ORDER BY priority ASC, created_at ASC
    LIMIT 1
  `).get(timestamp) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  const leaseExpiresAt = addSecondsToIso(timestamp, Math.max(60, input.leaseTtlSeconds));
  const result = db.prepare(`
    UPDATE queued_jobs
    SET
      status = 'running',
      attempts = attempts + 1,
      leased_by = ?,
      leased_at = ?,
      lease_expires_at = ?,
      updated_at = ?
    WHERE id = ?
      AND status = 'queued'
  `).run(
    input.workerId,
    timestamp,
    leaseExpiresAt,
    timestamp,
    String(row.id)
  );

  if (Number(result.changes ?? 0) === 0) {
    return null;
  }

  const claimed = db.prepare(`
    SELECT *
    FROM queued_jobs
    WHERE id = ?
  `).get(String(row.id)) as Record<string, unknown>;

  return mapQueuedJob(claimed);
}

export function heartbeatQueuedJob(input: {
  databasePath?: string;
  queueId: string;
  workerId: string;
  leaseTtlSeconds: number;
}): void {
  const { db } = getQueueDatabase(input.databasePath);
  const timestamp = nowIso();
  db.prepare(`
    UPDATE queued_jobs
    SET
      lease_expires_at = ?,
      updated_at = ?
    WHERE id = ?
      AND leased_by = ?
  `).run(
    addSecondsToIso(timestamp, Math.max(60, input.leaseTtlSeconds)),
    timestamp,
    input.queueId,
    input.workerId
  );
}

export function completeQueuedJob(input: {
  databasePath?: string;
  queueId: string;
  workerId: string;
  result?: unknown;
}): void {
  const { db } = getQueueDatabase(input.databasePath);
  const timestamp = nowIso();
  db.prepare(`
    UPDATE queued_jobs
    SET
      status = 'completed',
      result_json = ?,
      leased_by = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      updated_at = ?,
      completed_at = ?
    WHERE id = ?
      AND leased_by = ?
  `).run(
    serializeJson(input.result),
    timestamp,
    timestamp,
    input.queueId,
    input.workerId
  );
}

export function failQueuedJob(input: {
  databasePath?: string;
  queueId: string;
  workerId: string;
  errorMessage: string;
  retryDelaySeconds?: number;
}): void {
  const { db } = getQueueDatabase(input.databasePath);
  const timestamp = nowIso();
  const row = db.prepare(`
    SELECT attempts, max_attempts, payload_json
    FROM queued_jobs
    WHERE id = ?
  `).get(input.queueId) as Record<string, unknown> | undefined;

  if (!row) {
    return;
  }

  const attempts = Number(row.attempts ?? 0);
  const maxAttempts = Number(row.max_attempts ?? 3);
  const shouldRetry = attempts < maxAttempts;
  const payload = parseJsonValue<QueuedAgentJobPayload>(row.payload_json, {
    taskType: "agent",
    mode: "agent",
    label: "",
    options: {
      instruction: "",
      resume: true
    }
  });
  payload.options = {
    ...payload.options,
    resume: true
  };

  db.prepare(`
    UPDATE queued_jobs
    SET
      status = ?,
      payload_json = ?,
      last_error = ?,
      leased_by = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      run_after = ?,
      updated_at = ?,
      completed_at = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
    WHERE id = ?
      AND leased_by = ?
  `).run(
    shouldRetry ? "queued" : "failed",
    serializeJson(payload),
    input.errorMessage,
    shouldRetry
      ? addSecondsToIso(timestamp, Math.max(30, input.retryDelaySeconds ?? 300))
      : timestamp,
    timestamp,
    shouldRetry ? "queued" : "failed",
    timestamp,
    input.queueId,
    input.workerId
  );
}
