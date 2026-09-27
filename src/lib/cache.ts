import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { CacheEnvelope } from "../types";

const CACHE_VERSION = 1;

export function ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function resolveCacheDir(customDir?: string): string {
  return ensureDir(path.resolve(customDir ?? path.join(process.cwd(), ".cache")));
}

export function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${stamp}_${suffix}`;
}

export function buildCachePath(task: string, runId: string, customDir?: string): string {
  const dir = resolveCacheDir(customDir);
  return path.join(dir, `${task}_run_${runId}.json`);
}

export function writeTextAtomic(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${randomUUID()}.tmp`;

  try {
    fs.writeFileSync(tempPath, contents, { encoding: "utf8", flag: "wx" });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Keep the original write or rename error.
    }
    throw error;
  }
}

export function writeJsonAtomic(filePath: string, payload: unknown): void {
  writeTextAtomic(filePath, JSON.stringify(payload, null, 2));
}

export function saveTaskState<T extends { runId: string }>(
  task: string,
  filePath: string,
  state: T
): string {
  const envelope: CacheEnvelope<T> = {
    version: CACHE_VERSION,
    task,
    runId: state.runId,
    savedAt: new Date().toISOString(),
    state
  };
  writeJsonAtomic(filePath, envelope);
  return filePath;
}

export function loadTaskState<T extends { runId: string }>(filePath: string, expectedTask?: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "state" in parsed) {
    const envelope = parsed as Record<string, unknown>;
    const state = envelope.state;
    if (envelope.version !== CACHE_VERSION) {
      throw new Error(`Unsupported cache envelope version: ${String(envelope.version)}.`);
    }
    if (
      typeof envelope.task !== "string" ||
      typeof envelope.runId !== "string" ||
      typeof envelope.savedAt !== "string" ||
      !Number.isFinite(Date.parse(envelope.savedAt)) ||
      !state ||
      typeof state !== "object" ||
      Array.isArray(state)
    ) {
      throw new Error("Cache envelope is malformed.");
    }
    if (expectedTask !== undefined && envelope.task !== expectedTask) {
      throw new Error(`Cache task type does not match requested task: ${expectedTask}.`);
    }
    if ((state as Record<string, unknown>).runId !== envelope.runId) {
      throw new Error("Cache envelope run ID does not match its saved task state.");
    }
    return state as T;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    typeof (parsed as Record<string, unknown>).runId !== "string"
  ) {
    throw new Error("Cache does not contain a task state with a run ID.");
  }
  return parsed as T;
}

export function findLatestCacheFile(task: string, customDir?: string): string | null {
  const dir = resolveCacheDir(customDir);
  const prefix = `${task}_run_`;
  const candidates = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => path.join(dir, entry.name));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftStat = fs.statSync(left).mtimeMs;
    const rightStat = fs.statSync(right).mtimeMs;
    return rightStat - leftStat;
  });

  return candidates[0] ?? null;
}

export function createOrResumeState<T extends { runId: string }>(options: {
  task: string;
  resume: boolean;
  cachePath?: string;
  cacheDir?: string;
  createInitialState: () => T;
}): { state: T; cachePath: string; resumed: boolean } {
  const explicitPath = options.cachePath ? path.resolve(options.cachePath) : undefined;

  if (options.resume) {
    const candidatePath = explicitPath ?? findLatestCacheFile(options.task, options.cacheDir);
    if (candidatePath && fs.existsSync(candidatePath)) {
      return {
        state: loadTaskState<T>(candidatePath, options.task),
        cachePath: candidatePath,
        resumed: true
      };
    }
  }

  const initialState = options.createInitialState();
  const cachePath = explicitPath ?? buildCachePath(options.task, initialState.runId, options.cacheDir);
  saveTaskState(options.task, cachePath, initialState);

  return {
    state: initialState,
    cachePath,
    resumed: false
  };
}
