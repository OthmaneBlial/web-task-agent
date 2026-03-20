import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { ensureDir, writeJsonAtomic } from "./cache";
import type {
  LlmTraceErrorRecord,
  LlmTraceHooks,
  LlmTraceStartRecord,
  LlmTraceSuccessRecord
} from "./llm";

interface PromptTraceRecord {
  traceId: string;
  operation: string;
  promptVersion: string;
  model: string;
  maxTokens: number;
  createdAt: string;
  completedAt: string | null;
  durationMs: number | null;
  status: "running" | "completed" | "failed";
  systemHash: string;
  promptHash: string;
  responseHash: string | null;
  system: string;
  prompt: string;
  responseText: string | null;
  responsePreview: string | null;
  errorMessage: string | null;
}

interface PromptTraceManifest {
  version: 1;
  updatedAt: string;
  traces: PromptTraceRecord[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function loadManifest(filePath: string): PromptTraceManifest {
  if (!fs.existsSync(filePath)) {
    return {
      version: 1,
      updatedAt: nowIso(),
      traces: []
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PromptTraceManifest>;
    return {
      version: 1,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : nowIso(),
      traces: Array.isArray(parsed.traces) ? parsed.traces as PromptTraceRecord[] : []
    };
  } catch {
    return {
      version: 1,
      updatedAt: nowIso(),
      traces: []
    };
  }
}

function toBaseRecord(record: LlmTraceStartRecord): PromptTraceRecord {
  return {
    traceId: record.traceId,
    operation: record.operation,
    promptVersion: record.promptVersion,
    model: record.model,
    maxTokens: record.maxTokens,
    createdAt: record.createdAt,
    completedAt: null,
    durationMs: null,
    status: "running",
    systemHash: hashValue(record.system),
    promptHash: hashValue(record.prompt),
    responseHash: null,
    system: record.system,
    prompt: record.prompt,
    responseText: null,
    responsePreview: null,
    errorMessage: null
  };
}

export class PromptTraceRecorder {
  private manifest: PromptTraceManifest;

  constructor(
    private readonly outputPath: string,
    private readonly appendRunEvent?: (eventType: string, message: string, metadata?: unknown) => void
  ) {
    ensureDir(path.dirname(this.outputPath));
    this.manifest = loadManifest(this.outputPath);
    this.persist();
  }

  private persist(): void {
    this.manifest.updatedAt = nowIso();
    writeJsonAtomic(this.outputPath, this.manifest);
  }

  private updateRecord(
    traceId: string,
    updater: (record: PromptTraceRecord) => PromptTraceRecord
  ): void {
    const index = this.manifest.traces.findIndex((record) => record.traceId === traceId);
    if (index === -1) {
      return;
    }
    this.manifest.traces[index] = updater(this.manifest.traces[index]!);
    this.persist();
  }

  createHooks(): LlmTraceHooks {
    return {
      onStart: (record) => {
        this.manifest.traces.push(toBaseRecord(record));
        this.persist();
        this.appendRunEvent?.(
          "llm_prompt_start",
          `LLM prompt started: ${record.operation} (${record.promptVersion})`,
          {
            traceId: record.traceId,
            operation: record.operation,
            promptVersion: record.promptVersion,
            model: record.model,
            maxTokens: record.maxTokens
          }
        );
      },
      onSuccess: (record) => {
        this.updateRecord(record.traceId, (existing) => ({
          ...existing,
          completedAt: record.completedAt,
          durationMs: record.durationMs,
          status: "completed",
          responseHash: hashValue(record.responseText),
          responseText: record.responseText,
          responsePreview: normalizeText(record.responseText).slice(0, 280) || null
        }));
        this.appendRunEvent?.(
          "llm_prompt_complete",
          `LLM prompt completed: ${record.operation} (${record.promptVersion})`,
          {
            traceId: record.traceId,
            operation: record.operation,
            promptVersion: record.promptVersion,
            durationMs: record.durationMs
          }
        );
      },
      onError: (record) => {
        this.updateRecord(record.traceId, (existing) => ({
          ...existing,
          completedAt: record.completedAt,
          durationMs: record.durationMs,
          status: "failed",
          errorMessage: record.errorMessage
        }));
        this.appendRunEvent?.(
          "llm_prompt_error",
          `LLM prompt failed: ${record.operation} (${record.promptVersion})`,
          {
            traceId: record.traceId,
            operation: record.operation,
            promptVersion: record.promptVersion,
            durationMs: record.durationMs,
            errorMessage: record.errorMessage
          }
        );
      }
    };
  }
}

export function createPromptTraceRecorder(input: {
  outputPath: string;
  appendRunEvent?: (eventType: string, message: string, metadata?: unknown) => void;
}): PromptTraceRecorder {
  return new PromptTraceRecorder(input.outputPath, input.appendRunEvent);
}
