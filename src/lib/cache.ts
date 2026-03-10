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

export function writeJsonAtomic(filePath: string, payload: unknown): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, filePath);
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

export function loadTaskState<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as CacheEnvelope<T> | T;

  if (parsed && typeof parsed === "object" && "state" in parsed) {
    return (parsed as CacheEnvelope<T>).state;
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
        state: loadTaskState<T>(candidatePath),
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
