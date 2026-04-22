import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

import type { AgentRunOptions, QueueControlAction } from "../types";
import { resolveJobDatabasePath } from "./job-store";

type QueuedJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

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
  jobId: string | null;
  controlAction: "pause" | "cancel" | null;
  controlRequestedAt: string | null;
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

function parseQueuedPayload(
  value: unknown,
  options?: {
    forceResume?: boolean;
  }
): QueuedAgentJobPayload {
  const fallback: QueuedAgentJobPayload = {
    taskType: "agent",
    mode: "agent",
    label: "",
    options: {
      instruction: "",
      resume: false
    }
  };
  const payload =
    value && typeof value === "object"
      ? (value as Partial<QueuedAgentJobPayload>)
      : parseJsonValue<QueuedAgentJobPayload>(value, fallback);
  const payloadOptions = payload.options ?? {
    instruction: "",
    resume: false
  };

  return {
    taskType: "agent",
    mode: payload.mode === "workflow" ? "workflow" : "agent",
    label: typeof payload.label === "string" ? payload.label : fallback.label,
    options: {
      ...payloadOptions,
      resume: options?.forceResume ? true : Boolean(payloadOptions.resume)
    }
  };
}

function addSecondsToIso(input: string, seconds: number): string {
  return new Date(Date.parse(input) + seconds * 1000).toISOString();
}

function ensureTableColumns(
  db: DatabaseSync,
  tableName: string,
  columns: Array<{
    name: string;
    definition: string;
  }>
): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
  const existing = new Set(rows.map((row) => String(row.name ?? "")));
  for (const column of columns) {
    if (existing.has(column.name)) {
      continue;
    }
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition}`);
  }
}

export function getQueuedJobSummary(options?: {
  databasePath?: string;
}): {
  queued: number;
  running: number;
  paused: number;
  completed: number;
  failed: number;
  cancelled: number;
} {
  const { db } = getQueueDatabase(options?.databasePath);
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
      SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) AS paused,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM queued_jobs
  `).get() as Record<string, unknown> | undefined;

  return {
    queued: Number(row?.queued ?? 0),
    running: Number(row?.running ?? 0),
    paused: Number(row?.paused ?? 0),
    completed: Number(row?.completed ?? 0),
    failed: Number(row?.failed ?? 0),
    cancelled: Number(row?.cancelled ?? 0)
  };
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
      job_id TEXT,
      control_action TEXT,
      control_requested_at TEXT,
      leased_by TEXT,
      leased_at TEXT,
      lease_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  ensureTableColumns(db, "queued_jobs", [
    { name: "job_id", definition: "TEXT" },
    { name: "control_action", definition: "TEXT" },
    { name: "control_requested_at", definition: "TEXT" }
  ]);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_queued_jobs_status ON queued_jobs(status, run_after);
    CREATE INDEX IF NOT EXISTS idx_queued_jobs_lease_expires_at ON queued_jobs(lease_expires_at);
    CREATE INDEX IF NOT EXISTS idx_queued_jobs_job_id ON queued_jobs(job_id, updated_at);
  `);

  return {
    db,
    databasePath
  };
}

function mapQueuedJob(row: Record<string, unknown>): QueuedJobRecord {
  const attempts = Number(row.attempts ?? 0);

  return {
    queueId: String(row.id ?? ""),
    taskType: String(row.task_type ?? ""),
    mode: String(row.mode ?? ""),
    label: String(row.label ?? ""),
    status: String(row.status ?? "queued") as QueuedJobStatus,
    priority: Number(row.priority ?? 100),
    attempts,
    maxAttempts: Number(row.max_attempts ?? 3),
    runAfter: String(row.run_after ?? ""),
    leaseExpiresAt: row.lease_expires_at ? String(row.lease_expires_at) : null,
    jobId: row.job_id ? String(row.job_id) : null,
    controlAction:
      row.control_action === "pause" || row.control_action === "cancel"
        ? (row.control_action as "pause" | "cancel")
        : null,
    controlRequestedAt: row.control_requested_at ? String(row.control_requested_at) : null,
    payload: parseQueuedPayload(row.payload_json, {
      forceResume: attempts > 1
    }),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}

export function enqueueQueuedAgentJob(input: {
  databasePath?: string;
  payload: QueuedAgentJobPayload;
  jobId?: string | null;
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
  const normalizedPayload = parseQueuedPayload(payload);

  db.prepare(`
    INSERT INTO queued_jobs (
      id, task_type, mode, label, status, priority, attempts, max_attempts,
      run_after, payload_json, result_json, job_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'queued', ?, 0, ?, ?, ?, '{}', ?, ?, ?)
  `).run(
    queueId,
    normalizedPayload.taskType,
    normalizedPayload.mode,
    normalizedPayload.label,
    input.priority ?? 100,
    Math.max(1, Math.min(10, input.maxAttempts ?? 3)),
    addSecondsToIso(timestamp, Math.max(0, input.delaySeconds ?? 0)),
    serializeJson(normalizedPayload),
    input.jobId ?? null,
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
  jobId?: string;
  limit?: number;
}): QueuedJobRecord[] {
  const { db } = getQueueDatabase(options?.databasePath);
  const rows = db.prepare(`
    SELECT *
    FROM queued_jobs
    WHERE (? IS NULL OR status = ?)
      AND (? IS NULL OR job_id = ?)
    ORDER BY
      CASE status
        WHEN 'running' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'paused' THEN 2
        WHEN 'failed' THEN 3
        WHEN 'cancelled' THEN 4
        ELSE 5
      END,
      priority ASC,
      attempts ASC,
      run_after ASC,
      created_at ASC
    LIMIT ?
  `).all(
    options?.status ?? null,
    options?.status ?? null,
    options?.jobId ?? null,
    options?.jobId ?? null,
    Math.max(1, Math.min(100, options?.limit ?? 50))
  ) as Array<Record<string, unknown>>;

  return rows.map(mapQueuedJob);
}

export function getQueuedJob(input: {
  databasePath?: string;
  queueId: string;
}): QueuedJobRecord | null {
  const { db } = getQueueDatabase(input.databasePath);
  const row = db.prepare(`
    SELECT *
    FROM queued_jobs
    WHERE id = ?
  `).get(input.queueId) as Record<string, unknown> | undefined;

  return row ? mapQueuedJob(row) : null;
}

export function linkQueuedJobToJob(input: {
  databasePath?: string;
  queueId: string;
  jobId: string;
}): void {
  const { db } = getQueueDatabase(input.databasePath);
  db.prepare(`
    UPDATE queued_jobs
    SET
      job_id = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.jobId,
    nowIso(),
    input.queueId
  );
}

export function recoverStaleQueuedJobs(options?: {
  databasePath?: string;
}): number {
  const { db } = getQueueDatabase(options?.databasePath);
  const timestamp = nowIso();
  const staleRows = db.prepare(`
    SELECT id, payload_json
    FROM queued_jobs
    WHERE status = 'running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= ?
  `).all(timestamp) as Array<Record<string, unknown>>;

  if (staleRows.length === 0) {
    return 0;
  }

  const updateStatement = db.prepare(`
    UPDATE queued_jobs
    SET
      status = 'queued',
      payload_json = ?,
      control_action = NULL,
      control_requested_at = NULL,
      leased_by = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      run_after = ?,
      updated_at = ?
    WHERE id = ?
      AND status = 'running'
      AND lease_expires_at IS NOT NULL
      AND lease_expires_at <= ?
  `);

  let recoveredCount = 0;
  for (const row of staleRows) {
    const payload = parseQueuedPayload(row.payload_json, {
      forceResume: true
    });
    const result = updateStatement.run(
      serializeJson(payload),
      timestamp,
      timestamp,
      String(row.id ?? ""),
      timestamp
    );
    recoveredCount += Number(result.changes ?? 0);
  }

  return recoveredCount;
}

export function controlQueuedJob(input: {
  databasePath?: string;
  queueId: string;
  action: QueueControlAction;
}): QueuedJobRecord | null {
  const { db } = getQueueDatabase(input.databasePath);
  const timestamp = nowIso();
  const row = db.prepare(`
    SELECT *
    FROM queued_jobs
    WHERE id = ?
  `).get(input.queueId) as Record<string, unknown> | undefined;

  if (!row) {
    return null;
  }

  const job = mapQueuedJob(row);
  const payload = parseQueuedPayload(row.payload_json, {
    forceResume:
      input.action === "resume" ||
      input.action === "retry" ||
      job.status === "paused" ||
      job.attempts > 0
  });

  if (input.action === "pause") {
    if (job.status === "queued") {
      db.prepare(`
        UPDATE queued_jobs
        SET
          status = 'paused',
          control_action = NULL,
          control_requested_at = NULL,
          updated_at = ?
        WHERE id = ?
      `).run(timestamp, input.queueId);
    } else if (job.status === "running") {
      db.prepare(`
        UPDATE queued_jobs
        SET
          control_action = 'pause',
          control_requested_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, input.queueId);
    }
  }

  if (input.action === "resume" && job.status === "paused") {
    db.prepare(`
      UPDATE queued_jobs
      SET
        status = 'queued',
        payload_json = ?,
        control_action = NULL,
        control_requested_at = NULL,
        run_after = ?,
        completed_at = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      serializeJson(payload),
      timestamp,
      timestamp,
      input.queueId
    );
  }

  if (input.action === "cancel") {
    if (job.status === "running") {
      db.prepare(`
        UPDATE queued_jobs
        SET
          control_action = 'cancel',
          control_requested_at = ?,
          updated_at = ?
        WHERE id = ?
      `).run(timestamp, timestamp, input.queueId);
    } else if (job.status !== "completed" && job.status !== "cancelled") {
      db.prepare(`
        UPDATE queued_jobs
        SET
          status = 'cancelled',
          control_action = NULL,
          control_requested_at = NULL,
          lease_expires_at = NULL,
          leased_at = NULL,
          leased_by = NULL,
          updated_at = ?,
          completed_at = ?
        WHERE id = ?
      `).run(
        timestamp,
        timestamp,
        input.queueId
      );
    }
  }

  if (input.action === "retry" && (job.status === "failed" || job.status === "cancelled")) {
    db.prepare(`
      UPDATE queued_jobs
      SET
        status = 'queued',
        payload_json = ?,
        control_action = NULL,
        control_requested_at = NULL,
        run_after = ?,
        completed_at = NULL,
        updated_at = ?
      WHERE id = ?
    `).run(
      serializeJson(parseQueuedPayload(row.payload_json, { forceResume: true })),
      timestamp,
      timestamp,
      input.queueId
    );
  }

  return getQueuedJob({
    databasePath: input.databasePath,
    queueId: input.queueId
  });
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
      control_action = NULL,
      control_requested_at = NULL,
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

export function settleControlledQueuedJob(input: {
  databasePath?: string;
  queueId: string;
  workerId: string;
  status: "paused" | "cancelled";
  result?: unknown;
}): void {
  const { db } = getQueueDatabase(input.databasePath);
  const timestamp = nowIso();
  const row = db.prepare(`
    SELECT payload_json
    FROM queued_jobs
    WHERE id = ?
  `).get(input.queueId) as Record<string, unknown> | undefined;
  const payload = parseQueuedPayload(row?.payload_json, {
    forceResume: input.status === "paused"
  });

  db.prepare(`
    UPDATE queued_jobs
    SET
      status = ?,
      payload_json = ?,
      result_json = ?,
      control_action = NULL,
      control_requested_at = NULL,
      leased_by = NULL,
      leased_at = NULL,
      lease_expires_at = NULL,
      updated_at = ?,
      completed_at = CASE WHEN ? = 'cancelled' THEN ? ELSE NULL END
    WHERE id = ?
      AND leased_by = ?
  `).run(
    input.status,
    serializeJson(payload),
    serializeJson(input.result),
    timestamp,
    input.status,
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
  const payload = parseQueuedPayload(row.payload_json, {
    forceResume: true
  });
  const retryAt = shouldRetry
    ? addSecondsToIso(timestamp, Math.max(30, input.retryDelaySeconds ?? 300))
    : null;
  const resultPayload = {
    status: shouldRetry ? "queued" : "failed",
    errorMessage: input.errorMessage,
    attempts,
    maxAttempts,
    retryAt
  };

  db.prepare(`
    UPDATE queued_jobs
    SET
      status = ?,
      payload_json = ?,
      result_json = ?,
      last_error = ?,
      control_action = NULL,
      control_requested_at = NULL,
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
    serializeJson(resultPayload),
    input.errorMessage,
    shouldRetry ? retryAt : timestamp,
    timestamp,
    shouldRetry ? "queued" : "failed",
    timestamp,
    input.queueId,
    input.workerId
  );
}
